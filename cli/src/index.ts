#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs"
import { execSync, spawn } from "child_process"
import { resolve, join, isAbsolute } from "path"
import { homedir } from "os"
import { processReports } from "./code.js"
import { cmdEvolve, showEvolveUsage } from "./evolve.js"

const ULTRAPLAN_ROOT = resolve(import.meta.dirname, "../..")
const STUDIES_DIR = join(ULTRAPLAN_ROOT, "studies")
const OPENCODE_CONFIG_PATH = resolve(import.meta.dirname, "../opencode-config.json")

const BACKOFF_DELAYS = [
  0.5 * 3_600_000,
  1 * 3_600_000,
  1.5 * 3_600_000,
  2 * 3_600_000,
  3 * 3_600_000,
  5 * 3_600_000,
  7 * 3_600_000,
  9 * 3_600_000,
  12 * 3_600_000,
  15 * 3_600_000,
  18 * 3_600_000,
  24 * 3_600_000,
]

interface Config {
  defaultModel: string
  primaryModel: string
  backupModel: string
  defaultVariant: string
  defaultParallel: number
  defaultTimeoutMs: number
  sprintPlanningModel: string
  sprintPlanningContextWindow: number
}

function loadConfig(): Config {
  try {
    return JSON.parse(readFileSync(join(ULTRAPLAN_ROOT, "config.json"), "utf-8"))
  } catch {
    return { defaultModel: "minimax-coding-plan/MiniMax-M2.7", primaryModel: "minimax-coding-plan/MiniMax-M2.7", backupModel: "opencode/deepseek-v4-flash-free", defaultVariant: "high", defaultParallel: 3, defaultTimeoutMs: 1800000, sprintPlanningModel: "openai/gpt-5.5", sprintPlanningContextWindow: 1000000 }
  }
}

type Source = { name: string; path: string }
type Dimension = { number: string; name: string; title: string; file: string }

interface TaskState {
  dimensionNumber: string
  dimensionName: string
  dimensionTitle: string
  sourceName: string
  status: "pending" | "running" | "completed" | "failed"
  attempts: number
  lastError: string | null
  lastAttemptAt: string | null
  nextRetryAt: string | null
  completedAt: string | null
}

interface SynthesisState {
  dimensionNumber: string
  dimensionName: string
  dimensionTitle: string
  status: "pending" | "running" | "completed" | "failed"
  attempts: number
  lastError: string | null
  lastAttemptAt: string | null
  nextRetryAt: string | null
  completedAt: string | null
}

interface RunState {
  version: number
  createdAt: string
  updatedAt: string
  batchSize: number
  tasks: TaskState[]
  synthesisTasks: SynthesisState[]
  isComplete: boolean
}

function discoverSources(ROOT: string): Source[] {
  const srcDir = join(ROOT, "sources")
  return readdirSync(srcDir)
    .filter(d => statSync(join(srcDir, d)).isDirectory() && !d.startsWith("."))
    .sort()
    .map(d => ({ name: d, path: join(srcDir, d) }))
}

function discoverDimensions(ROOT: string): Dimension[] {
  const dimDir = join(ROOT, "dimensions")
  return readdirSync(dimDir).filter(f => f.endsWith(".md")).sort().map(file => {
    const dash = file.indexOf("-")
    const number = dash > 0 ? file.slice(0, dash) : file.replace(".md", "")
    const name = file.slice(dash + 1).replace(".md", "")
    const content = readFileSync(join(dimDir, file), "utf-8")
    const title = content.split("\n")[0]?.replace(/^#\s*/i, "").trim() || name
    return { number, name, title, file }
  })
}

function resolveDimension(ref: string, all: Dimension[]): Dimension {
  const match = all.filter(d =>
    d.number === ref ||
    `${d.number}-${d.name}` === ref ||
    `${d.number}-${d.name}`.startsWith(ref) ||
    d.name.startsWith(ref)
  )
  if (match.length === 0) throw new Error(`Dimension "${ref}" not found`)
  if (match.length > 1) throw new Error(`Dimension "${ref}" is ambiguous: ${match.map(d => `${d.number}-${d.name}`).join(", ")}`)
  return match[0]
}

function resolveSource(ref: string, all: Source[]): Source {
  const match = all.filter(s => s.name === ref || s.name.startsWith(ref))
  if (match.length === 0) throw new Error(`Source "${ref}" not found`)
  if (match.length > 1) throw new Error(`Source "${ref}" is ambiguous: ${match.map(s => s.name).join(", ")}`)
  return match[0]
}

function readFile(filePath: string): string {
  try {
    return readFileSync(filePath, "utf-8")
  } catch {
    return ""
  }
}

function buildPrompt(ROOT: string, dimension: Dimension, source: Source): string {
  const dimFile = join(ROOT, "dimensions", dimension.file)
  const templateFile = join(ULTRAPLAN_ROOT, "templates", "repo-analysis.md")
  const baseFile = join(ULTRAPLAN_ROOT, "prompts", "base.md")
  const outputFile = `reports/source/${dimension.number}-${dimension.name}/${source.name}.md`

  const baseContent = readFile(baseFile)
  const dimContent = readFile(dimFile)
  const templateContent = readFile(templateFile)

  return [
    `# Study: ${dimension.title} — ${source.name}`,
    "",
    `Study **${source.name}** following the instructions below.`,
    "",
    "## Execution Instructions",
    "",
    baseContent || "(no base instructions)",
    "",
    "## Study Dimension",
    "",
    dimContent || "(no dimension content)",
    "",
    "## Target Source",
    "",
    `1. **${source.name}** (\`${source.path}\`)`,
    "",
    "## Instructions",
    "",
    "1. Follow the Execution Instructions above.",
    "2. Follow the Study Dimension above for the specific Steps, Evidence, and Questions.",
    "3. **HARD RULES**:",
    "   - When studying a source, NEVER access files outside that source's directory. BANNED.",
    "   - EVERY code mention MUST include \`path/to/file.ts:NN\`. No exceptions.",
    "4. Explore the source's code following the Study Dimension's Steps and Evidence sections.",
    "   Answer all the Study Dimension's Questions.",
    `5. Write the analysis to \`${outputFile}\` using the Output Template below.`,
    "",
    "## Output Template",
    "",
    templateContent || "(no template content)",
    "",
    "## Output",
    "",
    `- Per-source analysis: \`${outputFile}\``,
    "",
    "Work thoroughly. This is a comparative architecture study, not a surface skim.",
  ].join("\n")
}

function buildSynthesisPrompt(ROOT: string, dimension: Dimension, allSources: Source[]): string {
  const dimFile = join(ROOT, "dimensions", dimension.file)
  const templateFile = join(ULTRAPLAN_ROOT, "templates", "report.md")
  const synthFile = join(ULTRAPLAN_ROOT, "prompts", "synthesize.md")
  const reportFile = `reports/final/${dimension.number}-${dimension.name}.md`
  const analysisFiles = allSources.map(s =>
    `   - \`reports/source/${dimension.number}-${dimension.name}/${s.name}.md\``
  ).join("\n")
  const sourcesList = allSources.map(s => `- **${s.name}**`).join("\n")

  const synthContent = readFile(synthFile)
  const dimContent = readFile(dimFile)
  const templateContent = readFile(templateFile)

  return [
    `# Synthesis: ${dimension.title}`,
    "",
    "Read all per-source analysis files and create a combined study report.",
    "",
    "## Synthesis Instructions",
    "",
    synthContent || "(no synthesis instructions)",
    "",
    "## Study Dimension",
    "",
    dimContent || "(no dimension content)",
    "",
    "## Sources Studied",
    "",
    sourcesList,
    "",
    "## Per-Source Analysis Files to Read",
    "",
    analysisFiles,
    "",
    "## Instructions",
    "",
    "1. Read ALL per-source analysis files listed above.",
    "2. Follow the Synthesis Instructions and Study Dimension above.",
    `3. Write the report to \`${reportFile}\` using the Report Template below.`,
    "4. Fill in all template sections including cross-source comparison, synthesis, tradeoff matrix, and evidence index.",
    "5. Do NOT access any source code directly — all evidence is already captured in the analysis files.",
    "",
    "## Report Template",
    "",
    templateContent || "(no template content)",
    "",
    "## Output",
    "",
    `- Combined report: \`${reportFile}\``,
    "",
    "Work thoroughly. This is a comparative architecture study, not a surface skim.",
  ].join("\n")
}

function findOpenCode(): string {
  const candidates = ["opencode", join(homedir(), ".opencode", "bin", "opencode")]
  for (const c of candidates) {
    try {
      const r = execSync(`command -v ${c}`, { encoding: "utf-8" }).trim()
      if (r) return r
    } catch { /* try next */ }
  }
  return "opencode"
}

const OPENCODE_BIN = findOpenCode()

function runOpenCode(
  prompt: string,
  studyDir: string,
  opts: {
    model?: string
    variant?: string
    timeoutMs?: number
    primaryModel: string
    backupModel: string
    extraEnv?: Record<string, string>
  }
): Promise<{ code: number; rateLimited: boolean; rateLimitModel: string | null }> {
  return new Promise((resolvePromise, reject) => {
    const args: string[] = ["run", prompt]
    args.push("--dir", studyDir)
    args.push("--format", "json")
    if (opts.model) { args.push("--model", opts.model) }
    if (opts.variant) { args.push("--variant", opts.variant) }
    args.push("--dangerously-skip-permissions")

    let rateLimited = false
    let rateLimitModel: string | null = null
    let activeModel = opts.model || opts.primaryModel

    const child = spawn(OPENCODE_BIN, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, OPENCODE_CONFIG: OPENCODE_CONFIG_PATH, ...opts.extraEnv },
    })

    const timer = opts.timeoutMs
      ? setTimeout(() => {
          console.error(`\n✗ Timed out after ${opts.timeoutMs / 1000}s, killing process...`)
          child.kill()
        }, opts.timeoutMs)
      : null

    child.stdout?.on("data", (chunk: Buffer) => {
      process.stdout.write(chunk)
    })

    let stderrBuf = ""
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString()
    })

    child.on("close", (code) => {
      if (timer) clearTimeout(timer)
      const stderrLower = stderrBuf.toLowerCase()
      if (
        stderrLower.includes("rate limit") ||
        stderrLower.includes("rate_limit") ||
        stderrLower.includes("429") ||
        stderrLower.includes("too many requests") ||
        stderrLower.includes("quota exceeded") ||
        stderrLower.includes("monthly quota") ||
        stderrLower.includes("insufficient quota")
      ) {
        rateLimited = true
        rateLimitModel = activeModel
      }
      resolvePromise({ code: code ?? 1, rateLimited, rateLimitModel })
    })
    child.on("error", (err) => {
      if (timer) clearTimeout(timer)
      reject(err)
    })
  })
}

async function runWithConcurrency<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = []
  let idx = 0

  async function worker(): Promise<void> {
    while (idx < tasks.length) {
      const i = idx++
      results[i] = await tasks[i]()
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, worker)
  await Promise.all(workers)
  return results
}

function loadState(ROOT: string): RunState | null {
  const stateFile = join(ROOT, ".run-state.json")
  try {
    if (existsSync(stateFile)) {
      return JSON.parse(readFileSync(stateFile, "utf-8"))
    }
  } catch { /* corrupted or missing */ }
  return null
}

function saveState(ROOT: string, state: RunState): void {
  const stateFile = join(ROOT, ".run-state.json")
  state.updatedAt = new Date().toISOString()
  writeFileSync(stateFile, JSON.stringify(state, null, 2), "utf-8")
}

function validateCompletedTasks(ROOT: string, state: RunState, allSources: Source[], allDimensions: Dimension[]): number {
  let fixed = 0
  for (const t of state.tasks) {
    if (t.status !== "completed") continue
    const analysisPath = join(ROOT, "reports/source", `${t.dimensionNumber}-${t.dimensionName}`, `${t.sourceName}.md`)
    if (!existsSync(analysisPath)) {
      console.log(`  ⚠ Analysis "${t.dimensionTitle} × ${t.sourceName}" marked completed but file missing — resetting to pending`)
      t.status = "pending"
      t.attempts = 0
      t.completedAt = null
      t.lastAttemptAt = null
      t.lastError = "Per-source analysis file missing on resume"
      fixed++
    }
  }
  for (const s of state.synthesisTasks) {
    if (s.status !== "completed") continue
    const reportPath = join(ROOT, "reports/final", `${s.dimensionNumber}-${s.dimensionName}.md`)
    if (!existsSync(reportPath)) {
      console.log(`  ⚠ Synthesis "${s.dimensionTitle}" marked completed but report missing — resetting to pending`)
      s.status = "pending"
      s.attempts = 0
      s.completedAt = null
      s.lastAttemptAt = null
      s.lastError = "Synthesis report file missing on resume"
      fixed++
    }
  }
  return fixed
}

function findCompletedSources(ROOT: string, allSources: Source[], allDimensions: Dimension[]): Set<string> {
  const done = new Set<string>()
  for (const s of allSources) {
    for (const d of allDimensions) {
      const analysisPath = join(ROOT, "reports/source", `${d.number}-${d.name}`, `${s.name}.md`)
      if (existsSync(analysisPath)) done.add(`${s.name}-${d.number}`)
    }
  }
  return done
}

function createInitialState(ROOT: string, allSources: Source[], allDimensions: Dimension[], batchSize: number): RunState {
  const completed = findCompletedSources(ROOT, allSources, allDimensions)
  let foundCount = 0
  const taskStates: TaskState[] = []
  for (const d of allDimensions) {
    for (const s of allSources) {
      const key = `${s.name}-${d.number}`
      const isDone = completed.has(key)
      if (isDone) foundCount++
      taskStates.push({
        dimensionNumber: d.number,
        dimensionName: d.name,
        dimensionTitle: d.title,
        sourceName: s.name,
        status: isDone ? "completed" : "pending",
        attempts: isDone ? 1 : 0,
        lastError: null,
        lastAttemptAt: isDone ? new Date().toISOString() : null,
        nextRetryAt: null,
        completedAt: isDone ? new Date().toISOString() : null,
      })
    }
  }

  if (foundCount > 0) {
    console.log(`  Found ${foundCount} existing analysis file(s) — marking as completed`)
  }

  const synthesisTasks: SynthesisState[] = []
  for (const d of allDimensions) {
    const allDone = allSources.every(s => {
      const task = taskStates.find(t => t.dimensionNumber === d.number && t.sourceName === s.name)
      return task && task.status === "completed"
    })
    if (allDone && allSources.length > 0) {
      synthesisTasks.push({
        dimensionNumber: d.number,
        dimensionName: d.name,
        dimensionTitle: d.title,
        status: "completed",
        attempts: 1,
        lastError: null,
        lastAttemptAt: new Date().toISOString(),
        nextRetryAt: null,
        completedAt: new Date().toISOString(),
      })
      console.log(`  Synthesis for ${d.title} already complete — report found`)
    }
  }

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    batchSize,
    tasks: taskStates,
    synthesisTasks,
    isComplete: false,
  }
}

function getBackoffDelay(attempt: number): number {
  if (attempt <= 0) return 0
  const idx = Math.min(attempt - 1, BACKOFF_DELAYS.length - 1)
  return BACKOFF_DELAYS[idx]
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "0s"
  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  const secs = Math.floor((ms % 60_000) / 1_000)
  const parts: string[] = []
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`)
  return parts.join(" ")
}

function cmdStatus(ROOT: string): void {
  const state = loadState(ROOT)
  if (!state) {
    console.log("\nNo run state found. Start a run with: study run-loop")
    return
  }

  const analysisTotal = state.tasks.length
  const analysisCompleted = state.tasks.filter(t => t.status === "completed").length
  const analysisRunning = state.tasks.filter(t => t.status === "running").length
  const analysisFailed = state.tasks.filter(t => t.status === "failed").length
  const analysisPending = state.tasks.filter(t => t.status === "pending").length
  const analysisPct = analysisTotal > 0 ? (analysisCompleted / analysisTotal * 100).toFixed(1) : "0.0"

  const synthTotal = state.synthesisTasks.length
  const synthCompleted = state.synthesisTasks.filter(s => s.status === "completed").length
  const synthRunning = state.synthesisTasks.filter(s => s.status === "running").length
  const synthFailed = state.synthesisTasks.filter(s => s.status === "failed").length
  const synthPending = state.synthesisTasks.filter(s => s.status === "pending").length

  const grandTotal = analysisTotal + synthTotal
  const grandCompleted = analysisCompleted + synthCompleted

  console.log(`\nRun started: ${state.createdAt}`)
  console.log(`Last updated: ${state.updatedAt}`)
  console.log(`Batch size: ${state.batchSize}`)
  console.log(`Status: ${state.isComplete ? "✓ Complete" : "▶ In progress"}`)
  console.log(`\nAnalyses: ${analysisCompleted}/${analysisTotal} (${analysisPct}%)`)
  console.log(`  Completed: ${analysisCompleted}  Running: ${analysisRunning}  Failed: ${analysisFailed}  Pending: ${analysisPending}`)
  if (synthTotal > 0) {
    console.log(`Synthesis: ${synthCompleted}/${synthTotal}  Running: ${synthRunning}  Failed: ${synthFailed}  Pending: ${synthPending}`)
  }
  console.log(`Total: ${grandCompleted}/${grandTotal}`)
  console.log("")

  if (analysisFailed > 0 || analysisPending > 0 || synthFailed > 0 || synthPending > 0) {
    console.log("Remaining Analysis Tasks:")
    for (const t of state.tasks) {
      if (t.status === "completed") continue
      const label = `${t.dimensionTitle} × ${t.sourceName}`
      if (t.status === "running") {
        console.log(`  ▶ ${label} (attempt ${t.attempts})`)
      } else if (t.status === "failed") {
        const retryStr = t.nextRetryAt ? `, retry at ${t.nextRetryAt}` : ""
        console.log(`  ✗ ${label} (attempt ${t.attempts}${retryStr})`)
        if (t.lastError) console.log(`    Error: ${t.lastError}`)
      } else {
        console.log(`  ○ ${label}`)
      }
    }
    for (const s of state.synthesisTasks) {
      if (s.status === "completed") continue
      const label = `Synthesis: ${s.dimensionTitle}`
      if (s.status === "running") {
        console.log(`  ▶ ${label} (attempt ${s.attempts})`)
      } else if (s.status === "failed") {
        const retryStr = s.nextRetryAt ? `, retry at ${s.nextRetryAt}` : ""
        console.log(`  ✗ ${label} (attempt ${s.attempts}${retryStr})`)
        if (s.lastError) console.log(`    Error: ${s.lastError}`)
      } else {
        console.log(`  ○ ${label}`)
      }
    }
    console.log("")
  }
}

function cmdList(ROOT: string): void {
  const sources = discoverSources(ROOT)
  const dimensions = discoverDimensions(ROOT)

  console.log("\nAvailable Sources:\n")
  for (const s of sources) {
    console.log(`  ${s.name}`)
  }

  console.log("\nAvailable Dimensions:\n")
  for (const d of dimensions) {
    console.log(`  ${d.number}-${d.name}.md — ${d.title}`)
  }

  console.log("\nUsage:\n")
  console.log("  study <study-name> run <dimension-ref> <source-name> [options]")
  console.log("  study <study-name> run-all [options]")
  console.log("  study <study-name> run-loop [options]")
  console.log("  study <study-name> status")
  console.log("  study <study-name> list")
  console.log("  study code [--output <file>] <@report-file>...")
  console.log("  study sprint-plan <target> <sprint-slug> [options]\n")
}

async function cmdRun(ROOT: string, dimensionRef: string, sourceRef: string, opts: { model?: string; variant?: string; dryRun?: boolean; timeoutMs?: number; primaryModel: string; backupModel: string }) {
  const allSources = discoverSources(ROOT)
  const allDimensions = discoverDimensions(ROOT)
  const dimension = resolveDimension(dimensionRef, allDimensions)
  const source = resolveSource(sourceRef, allSources)

  const prompt = buildPrompt(ROOT, dimension, source)
  const resultsDir = join(ROOT, "reports/source", `${dimension.number}-${dimension.name}`)

  if (opts.dryRun) {
    console.log(`\n=== DRY RUN: ${dimension.title} → ${source.name} ===\n`)
    console.log(prompt)
    const modelFlag = opts.model ? ` --model ${opts.model}` : ""
    const variantFlag = opts.variant ? ` --variant ${opts.variant}` : ""
    console.log(`\nWould run: ${OPENCODE_BIN} run <inline-prompt> --dir ${ROOT}${modelFlag}${variantFlag}\n`)
    return
  }

  mkdirSync(resultsDir, { recursive: true })

  console.log(`\n▶ Studying ${dimension.title} on ${source.name}...\n`)

  const { code } = await runOpenCode(prompt, ROOT, { model: opts.model, variant: opts.variant, timeoutMs: opts.timeoutMs, primaryModel: opts.primaryModel, backupModel: opts.backupModel })

  if (code === 0) {
    console.log(`\n✓ Analysis done: ${dimension.title} → ${source.name}`)
    console.log(`  File: ${resultsDir}/${source.name}.md`)
    generateSummary(ROOT)
  } else {
    console.error(`\n✗ Failed (exit code ${code}): ${dimension.title} → ${source.name}`)
    process.exit(code)
  }
}

async function cmdRunAll(ROOT: string, opts: {
  model?: string
  variant?: string
  dryRun?: boolean
  parallel?: number
  timeoutMs?: number
  dimensionFilter?: string[]
  sourceFilter?: string[]
  primaryModel: string
  backupModel: string
}) {
  const allSources = discoverSources(ROOT).filter(s => !opts.sourceFilter || opts.sourceFilter.includes(s.name))
  const allDimensions = discoverDimensions(ROOT).filter(d => !opts.dimensionFilter || opts.dimensionFilter.includes(d.number))

  if (allDimensions.length === 0 || allSources.length === 0) {
    console.error("No matching dimensions or sources found")
    process.exit(1)
  }

  const concurrency = opts.parallel ?? 3
  const total = allDimensions.length * allSources.length
  console.log(`\n▶ Running ${total} analyses (${allDimensions.length} dimensions × ${allSources.length} sources)`)
  console.log(`  Parallel: ${concurrency}\n`)

  await runWithConcurrency(
    allDimensions.flatMap(dimension =>
      allSources.map(source => async () => {
        const prompt = buildPrompt(ROOT, dimension, source)
        const resultsDir = join(ROOT, "reports/source", `${dimension.number}-${dimension.name}`)

        if (opts.dryRun) {
          console.log(`[DRY RUN] ${dimension.title} → ${source.name}`)
          return
        }

        mkdirSync(resultsDir, { recursive: true })

        console.log(`[START] ${dimension.title} → ${source.name}`)
        const { code } = await runOpenCode(prompt, ROOT, { model: opts.model, variant: opts.variant, timeoutMs: opts.timeoutMs, primaryModel: opts.primaryModel, backupModel: opts.backupModel })
        if (code === 0) {
          console.log(`[DONE]  ${dimension.title} → ${source.name}`)
        } else {
          console.error(`[FAIL]  ${dimension.title} → ${source.name} (exit ${code})`)
        }
      })
    ),
    concurrency,
  )

  generateSummary(ROOT)

  console.log("\n✓ All per-source analyses completed")

  console.log("\n▶ Running synthesis for each dimension...\n")
  await runWithConcurrency(
    allDimensions.map(dimension => async () => {
      const prompt = buildSynthesisPrompt(ROOT, dimension, allSources)
      mkdirSync(join(ROOT, "reports/final"), { recursive: true })

      if (opts.dryRun) {
        console.log(`[DRY RUN] Synthesis: ${dimension.title}`)
        return
      }

      console.log(`[SYNTHESIS] ${dimension.title}`)
      const { code } = await runOpenCode(prompt, ROOT, { model: opts.model, variant: opts.variant, timeoutMs: opts.timeoutMs, primaryModel: opts.primaryModel, backupModel: opts.backupModel })
      if (code === 0) {
        console.log(`[DONE]  Synthesis: ${dimension.title}`)
      } else {
        console.error(`[FAIL]  Synthesis: ${dimension.title} (exit ${code})`)
      }
    }),
    concurrency,
  )

  generateSummary(ROOT)
  console.log("\n✓ All studies completed")
}

async function cmdRunLoop(ROOT: string, opts: {
  model?: string
  variant?: string
  dryRun?: boolean
  batchSize: number
  timeoutMs?: number
  dimensionFilter?: string[]
  sourceFilter?: string[]
  primaryModel: string
  backupModel: string
}) {
  if (opts.dryRun) {
    const allSources = discoverSources(ROOT).filter(s => !opts.sourceFilter || opts.sourceFilter.includes(s.name))
    const allDimensions = discoverDimensions(ROOT).filter(d => !opts.dimensionFilter || opts.dimensionFilter.includes(d.number))
    if (allDimensions.length === 0 || allSources.length === 0) {
      console.error("No matching dimensions or sources found")
      process.exit(1)
    }
    const existing = loadState(ROOT)
    const total = allDimensions.length * allSources.length
    console.log(`\n[DRY RUN] Would run ${total} analyses + ${allDimensions.length} synthesis tasks (batch size: ${opts.batchSize}):\n`)

    for (const d of allDimensions) {
      for (const s of allSources) {
        const analysisPath = join(ROOT, "reports/source", `${d.number}-${d.name}`, `${s.name}.md`)
        const exists = existsSync(analysisPath)
        const stateDone = existing?.tasks.find(
          t => t.dimensionNumber === d.number && t.sourceName === s.name && t.status === "completed"
        )
        const tag = exists || stateDone ? " [done]" : ""
        console.log(`  ${d.title} × ${s.name}${tag}`)
      }
    }
    console.log("")
    return
  }

  const allSources = discoverSources(ROOT).filter(s => !opts.sourceFilter || opts.sourceFilter.includes(s.name))
  const allDimensions = discoverDimensions(ROOT).filter(d => !opts.dimensionFilter || opts.dimensionFilter.includes(d.number))

  let state = loadState(ROOT)
  if (state) {
    console.log(`\n▶ Resuming existing run from ${state.createdAt}`)
    const fixed = validateCompletedTasks(ROOT, state, allSources, allDimensions)
    if (fixed > 0) {
      saveState(ROOT, state)
      console.log(`  Fixed ${fixed} task(s) with missing files`)
    }
    cmdStatus(ROOT)
  } else {
    if (allDimensions.length === 0 || allSources.length === 0) {
      console.error("No matching dimensions or sources found")
      process.exit(1)
    }
    state = createInitialState(ROOT, allSources, allDimensions, opts.batchSize)
    saveState(ROOT, state)
    const total = allDimensions.length * allSources.length
    console.log(`\n▶ Starting run: ${total} analyses + synthesis per dimension, batch size ${opts.batchSize}`)
  }

  let lastStatusTime = 0

  process.on("SIGINT", () => {
    console.log("\n\n⚠ Interrupted. Saving state before exit...")
    saveState(ROOT, state!)
    console.log(`State saved. Run to resume.`)
    process.exit(130)
  })

  while (!state.isComplete) {
    const now = Date.now()

    for (const d of allDimensions) {
      const allSourcesDone = allSources.every(s =>
        state.tasks.find(t => t.dimensionNumber === d.number && t.sourceName === s.name)?.status === "completed"
      )
      const synthExists = state.synthesisTasks.find(s => s.dimensionNumber === d.number)
      if (allSourcesDone && !synthExists) {
        state.synthesisTasks.push({
          dimensionNumber: d.number,
          dimensionName: d.name,
          dimensionTitle: d.title,
          status: "pending",
          attempts: 0,
          lastError: null,
          lastAttemptAt: null,
          nextRetryAt: null,
          completedAt: null,
        })
        console.log(`  ➜ Synthesis queued for ${d.title}`)
        saveState(ROOT, state)
      }
    }

    let analysisCompletedCount = 0
    const runnableAnalysis: TaskState[] = []
    let earliestRetry = Infinity

    for (const t of state.tasks) {
      switch (t.status) {
        case "completed":
          analysisCompletedCount++
          break
        case "pending":
          runnableAnalysis.push(t)
          break
        case "failed":
          if (t.nextRetryAt) {
            const retryTime = new Date(t.nextRetryAt).getTime()
            if (now >= retryTime) {
              t.status = "pending"
              runnableAnalysis.push(t)
            } else {
              earliestRetry = Math.min(earliestRetry, retryTime)
            }
          } else {
            t.status = "pending"
            runnableAnalysis.push(t)
          }
          break
        case "running":
          t.status = "pending"
          runnableAnalysis.push(t)
          break
      }
    }

    let synthesisCompletedCount = 0
    const runnableSynthesis: SynthesisState[] = []

    for (const s of state.synthesisTasks) {
      switch (s.status) {
        case "completed":
          synthesisCompletedCount++
          break
        case "pending":
          runnableSynthesis.push(s)
          break
        case "failed":
          if (s.nextRetryAt) {
            const retryTime = new Date(s.nextRetryAt).getTime()
            if (now >= retryTime) {
              s.status = "pending"
              runnableSynthesis.push(s)
            } else {
              earliestRetry = Math.min(earliestRetry, retryTime)
            }
          } else {
            s.status = "pending"
            runnableSynthesis.push(s)
          }
          break
        case "running":
          s.status = "pending"
          runnableSynthesis.push(s)
          break
      }
    }

    const totalTasks = state.tasks.length + state.synthesisTasks.length
    const completedCount = analysisCompletedCount + synthesisCompletedCount

    if (completedCount === totalTasks) {
      state.isComplete = true
      saveState(ROOT, state)
      generateSummary(ROOT)
      console.log("\n✓ All tasks completed!")
      cmdStatus(ROOT)
      break
    }

    if (runnableAnalysis.length === 0 && runnableSynthesis.length === 0) {
      if (earliestRetry < Infinity) {
        const wait = Math.min(earliestRetry - Date.now(), BACKOFF_DELAYS[BACKOFF_DELAYS.length - 1])
        if (wait > 0) {
          cmdStatus(ROOT)
          console.log(`⏳ All remaining tasks in backoff. Sleeping ${formatDuration(wait)} until next retry...`)
          console.log(`   (Next retry at: ${new Date(earliestRetry).toISOString()})`)
          await sleep(wait)
          continue
        }
      }
      if (analysisCompletedCount === state.tasks.length && runnableSynthesis.length === 0) {
        await sleep(5_000)
        continue
      }
      console.log("⚠ Unexpected state — no runnable tasks but not complete. Waiting 30s...")
      await sleep(30_000)
      continue
    }

    const runnable: (TaskState | SynthesisState)[] = []
    const synthCount = Math.min(runnableSynthesis.length, Math.ceil(opts.batchSize / 2))
    runnable.push(...runnableSynthesis.slice(0, synthCount))
    const analysisSlots = opts.batchSize - runnable.length
    runnable.push(...runnableAnalysis.slice(0, analysisSlots))
    const batch = runnable
    for (const t of batch) {
      t.status = "running"
      t.lastAttemptAt = new Date().toISOString()
      t.attempts++
    }
    saveState(ROOT, state)

    if (Date.now() - lastStatusTime > 10_000) {
      cmdStatus(ROOT)
      lastStatusTime = Date.now()
    }

    await Promise.all(batch.map(async (task) => {
      const isSynthesis = "dimensionName" in task && !("sourceName" in task)
      const synthTask = isSynthesis ? task as unknown as SynthesisState : null
      const analysisTask = !isSynthesis ? task as TaskState : null

      if (analysisTask) {
        const dim = allDimensions.find(d => d.number === analysisTask.dimensionNumber)
        const source = allSources.find(s => s.name === analysisTask.sourceName)
        if (!dim || !source) {
          analysisTask.status = "failed"
          analysisTask.lastError = "Dimension or source not found on filesystem"
          const delay = getBackoffDelay(analysisTask.attempts)
          analysisTask.nextRetryAt = delay > 0 ? new Date(Date.now() + delay).toISOString() : null
          saveState(ROOT, state!)
          console.log(`  ✗ [${analysisTask.dimensionTitle} × ${analysisTask.sourceName}] missing on disk, retry in ${formatDuration(delay)}`)
          return
        }

        const prompt = buildPrompt(ROOT, dim, source)
        const resultsDir = join(ROOT, "reports/source", `${analysisTask.dimensionNumber}-${analysisTask.dimensionName}`)
        mkdirSync(resultsDir, { recursive: true })

        console.log(`  ▶ [${analysisTask.dimensionTitle} × ${analysisTask.sourceName}] attempt ${analysisTask.attempts}`)

        let code: number
        let rateLimited = false
        let usedBackup = false

        try {
          const result = await runOpenCode(prompt, ROOT, {
            model: opts.model,
            variant: opts.variant,
            timeoutMs: opts.timeoutMs,
            primaryModel: opts.primaryModel,
            backupModel: opts.backupModel,
          })
          code = result.code
          rateLimited = result.rateLimited

          if (rateLimited && code === 0) {
            console.log(`  ⚠ Rate limit detected on ${result.rateLimitModel}, retrying with backup model...`)
            usedBackup = true
            const backupResult = await runOpenCode(prompt, ROOT, {
              model: opts.backupModel,
              variant: opts.variant,
              timeoutMs: opts.timeoutMs,
              primaryModel: opts.primaryModel,
              backupModel: opts.backupModel,
            })
            code = backupResult.code
            rateLimited = backupResult.rateLimited
          }
        } catch (err) {
          code = 1
          analysisTask.lastError = err instanceof Error ? err.message : String(err)
        }

        if (usedBackup) {
          analysisTask.lastError = (analysisTask.lastError ? analysisTask.lastError + "; " : "") + `Rate limit triggered primary model switch to backup`
        }

        if (code === 0) {
          analysisTask.status = "completed"
          analysisTask.completedAt = new Date().toISOString()
          console.log(`  ✓ [${analysisTask.dimensionTitle} × ${analysisTask.sourceName}] analysis written`)
        } else {
          analysisTask.status = "failed"
          const delay = getBackoffDelay(analysisTask.attempts)
          analysisTask.lastError = analysisTask.lastError || `Exit code ${code}`
          analysisTask.nextRetryAt = delay > 0 ? new Date(Date.now() + delay).toISOString() : null
          console.log(`  ✗ [${analysisTask.dimensionTitle} × ${analysisTask.sourceName}] failed (attempt ${analysisTask.attempts}), next retry in ${formatDuration(delay)}`)
        }
      } else if (synthTask) {
        const dim = allDimensions.find(d => d.number === synthTask.dimensionNumber)
        if (!dim) {
          synthTask.status = "failed"
          synthTask.lastError = "Dimension not found on filesystem"
          const delay = getBackoffDelay(synthTask.attempts)
          synthTask.nextRetryAt = delay > 0 ? new Date(Date.now() + delay).toISOString() : null
          saveState(ROOT, state!)
          console.log(`  ✗ Synthesis [${synthTask.dimensionTitle}] missing on disk, retry in ${formatDuration(delay)}`)
          return
        }

        const prompt = buildSynthesisPrompt(ROOT, dim, allSources)
        mkdirSync(join(ROOT, "reports/final"), { recursive: true })

        console.log(`  ▶ Synthesis [${synthTask.dimensionTitle}] attempt ${synthTask.attempts}`)

        let code: number
        let rateLimited = false
        let usedBackup = false

        try {
          const result = await runOpenCode(prompt, ROOT, {
            model: opts.model,
            variant: opts.variant,
            timeoutMs: opts.timeoutMs,
            primaryModel: opts.primaryModel,
            backupModel: opts.backupModel,
          })
          code = result.code
          rateLimited = result.rateLimited

          if (rateLimited && code === 0) {
            console.log(`  ⚠ Rate limit detected on ${result.rateLimitModel}, retrying with backup model...`)
            usedBackup = true
            const backupResult = await runOpenCode(prompt, ROOT, {
              model: opts.backupModel,
              variant: opts.variant,
              timeoutMs: opts.timeoutMs,
              primaryModel: opts.primaryModel,
              backupModel: opts.backupModel,
            })
            code = backupResult.code
            rateLimited = backupResult.rateLimited
          }
        } catch (err) {
          code = 1
          synthTask.lastError = err instanceof Error ? err.message : String(err)
        }

        if (usedBackup) {
          synthTask.lastError = (synthTask.lastError ? synthTask.lastError + "; " : "") + `Rate limit triggered primary model switch to backup`
        }

        if (code === 0) {
          const reportPath = join(ROOT, "reports/final", `${synthTask.dimensionNumber}-${synthTask.dimensionName}.md`)
          if (!existsSync(reportPath)) {
            synthTask.status = "failed"
            const delay = getBackoffDelay(synthTask.attempts)
            synthTask.lastError = "Synthesis completed (exit 0) but report file was not generated"
            synthTask.nextRetryAt = delay > 0 ? new Date(Date.now() + delay).toISOString() : null
            console.log(`  ⚠ Synthesis [${synthTask.dimensionTitle}] exit 0 but report missing, retry in ${formatDuration(delay)}`)
          } else {
            synthTask.status = "completed"
            synthTask.completedAt = new Date().toISOString()
            console.log(`  ✓ Synthesis [${synthTask.dimensionTitle}] report written`)
          }
        } else {
          synthTask.status = "failed"
          const delay = getBackoffDelay(synthTask.attempts)
          synthTask.lastError = synthTask.lastError || `Exit code ${code}`
          synthTask.nextRetryAt = delay > 0 ? new Date(Date.now() + delay).toISOString() : null
          console.log(`  ✗ Synthesis [${synthTask.dimensionTitle}] failed (attempt ${synthTask.attempts}), next retry in ${formatDuration(delay)}`)
        }
      }
      saveState(ROOT, state!)
    }))
  }
}

function findEvolveCommand(target: string, sprintSlug: string): string | null {
  const roadmapPath = join(ULTRAPLAN_ROOT, "targets", target, "roadmap.md")
  if (!existsSync(roadmapPath)) return null

  const content = readFileSync(roadmapPath, "utf-8")
  const slugMatch = sprintSlug.match(/\d+/)
  if (!slugMatch) return null

  const sprintNum = slugMatch[0]
  const lines = content.split("\n")
  let inTable = false

  for (const line of lines) {
    if (line.startsWith("| ---")) { inTable = true; continue }
    if (!inTable || !line.startsWith("|")) continue
    if (!line.includes(sprintSlug) && !line.startsWith(`| ${sprintNum}`)) continue

    const cmdMatch = line.match(/`(study evolve[^`]+)`/)
    if (cmdMatch) return cmdMatch[1]
  }
  return null
}

async function cmdPlanSprint(
  target: string,
  sprintSlug: string,
  opts: {
    model?: string
    variant?: string
    dryRun?: boolean
    timeoutMs?: number
    contextWindow?: number
  }
) {
  const targetDir = join(ULTRAPLAN_ROOT, "targets", target)
  if (!existsSync(targetDir)) {
    console.error(`\nError: Target "${target}" not found at targets/${target}`)
    process.exit(1)
  }

  const bundlePath = join(ULTRAPLAN_ROOT, "targets", target, "reports", "sprint-evidence", `${sprintSlug}.txt`)
  const bundleDir = join(ULTRAPLAN_ROOT, "targets", target, "reports", "sprint-evidence")
  if (!existsSync(bundlePath)) {
    const evolveCmd = findEvolveCommand(target, sprintSlug)
    if (!evolveCmd) {
      console.error(`\nError: Evidence bundle not found at ${bundlePath}`)
      console.error(`  Could not find evolve command for sprint "${sprintSlug}" in targets/${target}/roadmap.md`)
      console.error(`  Generate it manually: study evolve --top-sources 1 --output ${bundlePath} <evidence-packs>`)
      process.exit(1)
    }
    console.log(`\n▶ Evidence bundle not found. Generating via evolve...\n`)
    mkdirSync(bundleDir, { recursive: true })
    const parts = evolveCmd.split(/\s+/)
    const topSourcesIdx = parts.indexOf("--top-sources")
    const topSources = topSourcesIdx >= 0 ? parseInt(parts[topSourcesIdx + 1], 10) : 1
    const outputIdx = parts.indexOf("--output")
    const outputFile = outputIdx >= 0 ? parts[outputIdx + 1] : null
    const fileArgs = parts.filter(p => p.startsWith("@"))
    const resolvedArgs = fileArgs.map(a => {
      const stripped = a.slice(1)
      return isAbsolute(stripped) ? stripped : join(ULTRAPLAN_ROOT, stripped)
    })
    cmdEvolve(resolvedArgs, { topSources, outputFile: outputFile ? join(ULTRAPLAN_ROOT, outputFile) : null, noCode: false })
    if (!existsSync(bundlePath)) {
      console.error(`\nError: Evidence bundle still missing after evolve: ${bundlePath}`)
      process.exit(1)
    }
    console.log(`\n✓ Evidence bundle generated: ${bundlePath}\n`)
  }

  const promptPath = join(ULTRAPLAN_ROOT, "prompts", "plan-sprint.md")
  if (!existsSync(promptPath)) {
    console.error(`\nError: Sprint planning prompt not found at prompts/plan-sprint.md`)
    process.exit(1)
  }

  let prompt = readFileSync(promptPath, "utf-8")
  prompt = prompt.replace(/\{target\}/g, target).replace(/\{sprint-slug\}/g, sprintSlug)

  const outputDir = join(ULTRAPLAN_ROOT, "targets", target, "sprints", sprintSlug)
  const outputFile = join(outputDir, "plan.md")

  if (opts.dryRun) {
    console.log(`\n=== DRY RUN: plan-sprint ${target} ${sprintSlug} ===\n`)
    console.log(`Prompt file: ${promptPath}`)
    console.log(`Output file: ${outputFile}`)
    console.log(`Model: ${opts.model || "sprintPlanningModel"}`)
    console.log(`Evidence bundle: ${bundlePath}`)
    if (opts.contextWindow) {
      console.log(`Context window override: ${opts.contextWindow}`)
    }
    console.log("")
    return
  }

  mkdirSync(outputDir, { recursive: true })

  const extraEnv: Record<string, string> = {}
  if (opts.contextWindow && opts.model) {
    const slashIdx = opts.model.indexOf("/")
    if (slashIdx > 0) {
      const provider = opts.model.slice(0, slashIdx)
      const modelName = opts.model.slice(slashIdx + 1)
      extraEnv.OPENCODE_CONFIG_CONTENT = JSON.stringify({
        provider: {
          [provider]: {
            models: {
              [modelName]: {
                limit: { context: opts.contextWindow, output: 64000 },
              },
            },
          },
        },
      })
    }
  }

  console.log(`\n▶ Planning sprint ${sprintSlug} for target ${target}...\n`)

  const { code } = await runOpenCode(prompt, ULTRAPLAN_ROOT, {
    model: opts.model,
    variant: opts.variant,
    timeoutMs: opts.timeoutMs,
    primaryModel: opts.model || "",
    backupModel: "",
    extraEnv,
  })

  if (code === 0) {
    console.log(`\n✓ Sprint plan written: ${outputFile}`)
  } else {
    console.error(`\n✗ Sprint planning failed (exit code ${code})`)
    process.exit(code)
  }
}

function generateSummary(ROOT: string): void {
  const summaryFile = join(ROOT, "summary.csv")
  const sources = discoverSources(ROOT)
  const dimensions = discoverDimensions(ROOT)

  const header = ["source", ...dimensions.map(d => `"${d.title}"`), "total"]
  const rows: { source: string; scores: (number | null)[]; total: number }[] = []

  for (const source of sources) {
    const scores: (number | null)[] = []
    for (const d of dimensions) {
      const analysisPath = join(ROOT, "reports/source", `${d.number}-${d.name}`, `${source.name}.md`)
      scores.push(extractScore(analysisPath))
    }
    const total = scores.reduce((sum, s) => sum + (s ?? 0), 0)
    rows.push({ source: source.name, scores, total })
  }

  rows.sort((a, b) => b.total - a.total)

  const csvLines = [header.join(",")]
  for (const row of rows) {
    const scoreCells = row.scores.map(s => s !== null ? String(s) : "")
    csvLines.push([row.source, ...scoreCells, String(row.total)].join(","))
  }

  writeFileSync(summaryFile, csvLines.join("\n") + "\n", "utf-8")
  console.log(`\n✓ Summary written to summary.csv (${rows.length} sources × ${dimensions.length} dimensions)`)
}

function extractScore(filePath: string): number | null {
  try {
    const content = readFileSync(filePath, "utf-8")
    const match = content.match(/\*\*(\d+(?:\.\d+)?)\s*\/\s*10\s*\*\*/)
    return match ? parseFloat(match[1]) : null
  } catch {
    return null
  }
}

function listStudies(): string[] {
  return readdirSync(STUDIES_DIR)
    .filter(d => statSync(join(STUDIES_DIR, d)).isDirectory() && !d.startsWith("."))
    .sort()
}

function cmdListStudies(): void {
  const studies = listStudies()
  console.log("\nAvailable Studies:\n")
  for (const s of studies) {
    console.log(`  ${s}`)
  }
  console.log("\nUsage: study <study-name> <command> [args]")
  console.log("       study list")
  console.log("       study code [--output <file>] <@report-file>...")
  console.log("       study evolve [--top-sources <N>] [--output <file>] [--no-code] <@evidence-report>...")
  console.log("       study sprint-plan <target> <sprint-slug> [options]")
  console.log("       study sprint-plan --help\n")
}

function cmdCode(args: string[], ultraplanRoot: string): void {
  const outputIdx = args.indexOf("--output")
  let outputFile: string | null = null
  let fileArgs = args

  if (outputIdx >= 0) {
    outputFile = args[outputIdx + 1]
    fileArgs = args.filter((_, i) => i !== outputIdx && i !== outputIdx + 1)
  }

  if (fileArgs.length === 0) {
    console.error("Error: no report files specified.\nUsage: study code [--output <file>] <@report-file>...")
    process.exit(1)
  }

  const resolvedPaths = fileArgs.map(a => {
    const stripped = a.startsWith("@") ? a.slice(1) : a
    return isAbsolute(stripped) ? stripped : resolve(process.cwd(), stripped)
  })

  for (const p of resolvedPaths) {
    if (!existsSync(p)) {
      console.error(`Error: report file not found: ${p}`)
      process.exit(1)
    }
  }

  const output = processReports(resolvedPaths)

  if (outputFile) {
    writeFileSync(outputFile, output, "utf-8")
    console.log(`Code references written to ${outputFile}`)
  } else {
    console.log(output)
  }
}

async function main() {
  const args = process.argv.slice(2)

  if (!args.length || args[0] === "--help" || args[0] === "-h") {
    cmdListStudies()
    process.exit(0)
  }

  if (args[0] === "list") {
    cmdListStudies()
    process.exit(0)
  }

  if (args[0] === "code") {
    cmdCode(args.slice(1), ULTRAPLAN_ROOT)
    process.exit(0)
  }

  if (args[0] === "evolve") {
    const evolveArgs = args.slice(1)
    const topSourcesIdx = evolveArgs.indexOf("--top-sources")
    const topSources = topSourcesIdx >= 0 ? parseInt(evolveArgs[topSourcesIdx + 1], 10) : 5
    const outputIdx = evolveArgs.indexOf("--output")
    const outputFile = outputIdx >= 0 ? evolveArgs[outputIdx + 1] : null
    const noCode = evolveArgs.includes("--no-code")

    const flagIndices = new Set<number>()
    if (topSourcesIdx >= 0) { flagIndices.add(topSourcesIdx); flagIndices.add(topSourcesIdx + 1) }
    if (outputIdx >= 0) { flagIndices.add(outputIdx); flagIndices.add(outputIdx + 1) }
    const noCodeIdx = evolveArgs.indexOf("--no-code")
    if (noCodeIdx >= 0) flagIndices.add(noCodeIdx)

    const fileArgs = evolveArgs.filter((_, i) => !flagIndices.has(i))

    cmdEvolve(fileArgs, { topSources, outputFile, noCode })
    process.exit(0)
  }

  if (args[0] === "sprint-plan") {
    const sprArgs = args.slice(1)
    if (sprArgs.length < 2) {
      console.error("Usage: study sprint-plan <target> <sprint-slug> [--model <model>] [--variant <variant>] [--dry-run] [--timeout <ms>]")
      process.exit(1)
    }
    const CONFIG = loadConfig()
    const target = sprArgs[0]
    const sprintSlug = sprArgs[1]
    const modelIdx = sprArgs.indexOf("--model")
    const model = modelIdx >= 0 ? sprArgs[modelIdx + 1] : CONFIG.sprintPlanningModel
    const variantIdx = sprArgs.indexOf("--variant")
    const variant = variantIdx >= 0 ? sprArgs[variantIdx + 1] : CONFIG.defaultVariant
    const dryRun = sprArgs.includes("--dry-run")
    const timeoutIdx = sprArgs.indexOf("--timeout")
    const timeout = timeoutIdx >= 0 ? parseInt(sprArgs[timeoutIdx + 1], 10) : CONFIG.defaultTimeoutMs
    await cmdPlanSprint(target, sprintSlug, { model, variant, dryRun, timeoutMs: timeout, contextWindow: CONFIG.sprintPlanningContextWindow })
    process.exit(0)
  }

  const studyName = args[0]
  const studyDir = join(STUDIES_DIR, studyName)

  if (!existsSync(studyDir) || !statSync(studyDir).isDirectory()) {
    console.error(`\nError: Study "${studyName}" not found in studies/`)
    console.log(`\nAvailable studies:\n`)
    for (const s of listStudies()) {
      console.log(`  ${s}`)
    }
    console.log("")
    process.exit(1)
  }

  const ROOT = studyDir
  const CONFIG = loadConfig()

  const cmd = args[1]

  if (!cmd || cmd === "--help" || cmd === "-h") {
    console.log(`\nStudy: ${studyName}\n`)
    cmdList(ROOT)
    process.exit(0)
  }

  const modelIdx = args.indexOf("--model")
  const model = modelIdx >= 0 ? args[modelIdx + 1] : CONFIG.defaultModel
  const variantIdx = args.indexOf("--variant")
  const variant = variantIdx >= 0 ? args[variantIdx + 1] : CONFIG.defaultVariant
  const dryRun = args.includes("--dry-run")
  const parallelIdx = args.indexOf("--parallel")
  const parallel = parallelIdx >= 0 ? parseInt(args[parallelIdx + 1], 10) : undefined
  const batchIdx = args.indexOf("--batch-size")
  const batchSize = batchIdx >= 0 ? parseInt(args[batchIdx + 1], 10) : CONFIG.defaultParallel
  const timeoutIdx = args.indexOf("--timeout")
  const timeout = timeoutIdx >= 0 ? parseInt(args[timeoutIdx + 1], 10) : CONFIG.defaultTimeoutMs
  const sourceFilterIdx = args.indexOf("--sources")
  const sourceFilter = sourceFilterIdx >= 0 ? args[sourceFilterIdx + 1].split(",") : undefined
  const dimFilterIdx = args.indexOf("--dimensions")
  const dimFilter = dimFilterIdx >= 0 ? args[dimFilterIdx + 1].split(",") : undefined

  const positional = args.filter(a => !a.startsWith("--") && a !== studyName && a !== cmd)

  try {
    switch (cmd) {
      case "code": {
        cmdCode(positional, ULTRAPLAN_ROOT)
        break
      }

      case "list": {
        cmdList(ROOT)
        break
      }

      case "run": {
        if (positional.length < 2) throw new Error("Usage: study <study> run <dimension-ref> <source-name> [options]")
        await cmdRun(ROOT, positional[0], positional[1], { model, variant, dryRun, timeoutMs: timeout, primaryModel: CONFIG.primaryModel, backupModel: CONFIG.backupModel })
        break
      }

      case "run-all": {
        await cmdRunAll(ROOT, {
          model,
          variant,
          dryRun,
          timeoutMs: timeout,
          parallel: parallel ?? CONFIG.defaultParallel,
          dimensionFilter: dimFilter,
          sourceFilter,
          primaryModel: CONFIG.primaryModel,
          backupModel: CONFIG.backupModel,
        })
        break
      }

      case "run-loop": {
        await cmdRunLoop(ROOT, {
          model,
          variant,
          dryRun,
          batchSize,
          timeoutMs: timeout,
          dimensionFilter: dimFilter,
          sourceFilter,
          primaryModel: CONFIG.primaryModel,
          backupModel: CONFIG.backupModel,
        })
        break
      }

      case "status": {
        cmdStatus(ROOT)
        break
      }

      default: {
        throw new Error(`Unknown command: ${cmd}. Try: list, run, run-all, run-loop, status`)
      }
    }
  } catch (err: unknown) {
    console.error(`\nError: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  }
}

main()
