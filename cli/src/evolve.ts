import { readFileSync, existsSync, writeFileSync, readdirSync } from "fs"
import { resolve, relative, dirname, basename, isAbsolute, join } from "path"
import { parseReposTable, findCodeRefs, readCode, type CodeRef, type RepoEntry } from "./code.js"

const ULTRAPLAN_ROOT = resolve(import.meta.dirname, "../..")

interface SourceReport {
  path: string
  label: string
  type: "primary" | "supporting"
}

interface PerSourceReport {
  path: string
  name: string
  score: number
}

const SOURCE_REPORT_RE = /^\s*-\s*`([^`]+)`\s*$/
const SCORE_RE = /\*\*(\d+(?:\.\d+)?)\s*\/\s*10\s*\*\*/

function extractScore(content: string): number {
  const m = content.match(SCORE_RE)
  return m ? parseFloat(m[1]) : 0
}

function parseSourceReports(content: string): SourceReport[] {
  const reports: SourceReport[] = []
  const lines = content.split("\n")
  let inSourceReports = false
  let currentType: "primary" | "supporting" | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.trim() === "## Source Reports") {
      inSourceReports = true
      continue
    }

    if (!inSourceReports) continue

    if (line.startsWith("## ")) break

    if (line.trim() === "Primary:") {
      currentType = "primary"
      continue
    }
    if (line.trim() === "Supporting:") {
      currentType = "supporting"
      continue
    }

    if (currentType) {
      const m = line.match(SOURCE_REPORT_RE)
      if (m) {
        const relPath = m[1]
        const fullPath = resolve(ULTRAPLAN_ROOT, relPath)
        reports.push({ path: fullPath, label: relPath, type: currentType })
      }
    }
  }

  return reports
}

function findPerSourceReports(finalReportPath: string, topN: number): PerSourceReport[] {
  const relativePath = relative(ULTRAPLAN_ROOT, finalReportPath).replace(/\.md$/, "")
  const parts = relativePath.split("/")
  const dimPart = parts[parts.length - 1]

  const studyIdx = parts.indexOf("studies")
  if (studyIdx === -1 || studyIdx + 1 >= parts.length) return []

  const studyName = parts[studyIdx + 1]
  const sourceDir = resolve(ULTRAPLAN_ROOT, parts.slice(0, studyIdx + 2).join("/"), "reports/source", dimPart)

  if (!existsSync(sourceDir)) return []

  const reports: PerSourceReport[] = []
  for (const entry of readdirSync(sourceDir)) {
    if (!entry.endsWith(".md")) continue
    const fullPath = resolve(sourceDir, entry)
    const content = readFileSync(fullPath, "utf-8")
    const score = extractScore(content)
    reports.push({ path: fullPath, name: entry.replace(/\.md$/, ""), score })
  }

  reports.sort((a, b) => b.score - a.score)

  if (topN > 0 && topN < reports.length) {
    return reports.slice(0, topN)
  }

  return reports
}

function readReport(path: string): string {
  if (!existsSync(path)) return `// REPORT NOT FOUND: ${path}\n\n`
  return readFileSync(path, "utf-8")
}

interface EvolveOptions {
  topSources: number
  outputFile: string | null
  noCode: boolean
}

interface ReportEntry {
  type: "evidence" | "final" | "per-source"
  label: string
  path: string
  lines: number
  chars: number
}

interface RefStats {
  total: number
  rendered: number
  duplicateSkipped: number
  resolved: number
  unresolved: number
  unresolvedMdSelfRefs: number
  unresolvedCode: number
}

const DEFAULT_OPTIONS: EvolveOptions = {
  topSources: 5,
  outputFile: null,
  noCode: false,
}

export function cmdEvolve(fileArgs: string[], opts: Partial<EvolveOptions>): void {
  const options = { ...DEFAULT_OPTIONS, ...opts }

  if (fileArgs.length === 0) {
    console.error("Usage: study evolve [--top-sources <N>] [--output <file>] [--no-code] <@evidence-report>...")
    process.exit(1)
  }

  const resolvedPaths = fileArgs.map(a => {
    const stripped = a.startsWith("@") ? a.slice(1) : a
    return isAbsolute(stripped) ? stripped : resolve(process.cwd(), stripped)
  })

  for (const p of resolvedPaths) {
    if (!existsSync(p)) {
      console.error(`Error: evidence report not found: ${p}`)
      process.exit(1)
    }
  }

  const outputParts: string[] = []
  const stats: RefStats = {
    total: 0,
    rendered: 0,
    duplicateSkipped: 0,
    resolved: 0,
    unresolved: 0,
    unresolvedMdSelfRefs: 0,
    unresolvedCode: 0,
  }
  const reportLog: ReportEntry[] = []
  const seenFinalPaths = new Set<string>()
  const seenPerSourcePaths = new Set<string>()
  const seenCodeKeys = new Set<string>()

  function codeKey(ref: CodeRef): string {
    if (ref.fullPath) return `${ref.fullPath}:${ref.lineSpec}`
    return `unresolved:${ref.filePath}:${ref.lineSpec}`
  }

  function dedupedCode(refs: CodeRef[]): string {
    const parts: string[] = []
    for (const ref of refs) {
      stats.total++
      if (ref.repoName === "???") {
        stats.unresolved++
        if (ref.filePath.endsWith(".md")) stats.unresolvedMdSelfRefs++
        else stats.unresolvedCode++
      } else {
        stats.resolved++
      }
      const key = codeKey(ref)
      if (seenCodeKeys.has(key)) {
        stats.duplicateSkipped++
        continue
      }
      seenCodeKeys.add(key)
      stats.rendered++
      parts.push(readCode(ref))
    }
    return parts.join("")
  }

  // Phase 1: collect unique evidence packs + unique final reports
  const seenEvidence = new Set<string>()
  const uniqueEvidence: { path: string; content: string }[] = []
  const allFinalReports: SourceReport[] = []

  for (const evPath of resolvedPaths) {
    if (seenEvidence.has(evPath)) continue
    seenEvidence.add(evPath)
    const content = readReport(evPath)
    uniqueEvidence.push({ path: evPath, content })
    const srcReports = parseSourceReports(content)
    for (const sr of srcReports) {
      if (!seenFinalPaths.has(sr.path)) {
        seenFinalPaths.add(sr.path)
        allFinalReports.push(sr)
      }
    }
  }

  // Phase 2: collect unique per-source reports per final report
  interface FinalWithPerSource {
    sr: SourceReport
    perSource: PerSourceReport[]
  }
  const finalReportsWithPerSource: FinalWithPerSource[] = []
  for (const sr of allFinalReports) {
    const pss = findPerSourceReports(sr.path, options.topSources).filter(ps => {
      const key = ps.path
      if (seenPerSourcePaths.has(key)) return false
      seenPerSourcePaths.add(key)
      return true
    })
    finalReportsWithPerSource.push({ sr, perSource: pss })
  }

  // Phase 3: render evidence packs
  for (const ev of uniqueEvidence) {
    const evContent = ev.content
    reportLog.push({
      type: "evidence", label: basename(ev.path, ".md"), path: ev.path,
      lines: evContent.split("\n").length, chars: evContent.length,
    })
    outputParts.push(`════════════════════════════════════════════════════════`)
    outputParts.push(`Evidence Pack: ${basename(ev.path, ".md")}`)
    outputParts.push(`File: ${ev.path}`)
    outputParts.push(`════════════════════════════════════════════════════════`)
    outputParts.push("")
    outputParts.push(evContent.trimEnd())
    outputParts.push("")
  }

  // Phase 4: render deduplicated final reports + per-source + code
  for (const { sr, perSource: perSourceReports } of finalReportsWithPerSource) {
    const label = `[${sr.type === "primary" ? "PRIMARY" : "SUPPORTING"}] ${sr.label}`
    const srContent = readReport(sr.path)
    reportLog.push({
      type: "final", label: sr.label, path: sr.path,
      lines: srContent.split("\n").length, chars: srContent.length,
    })

    outputParts.push(`════════════════════════════════════════════════════════`)
    outputParts.push(`Final Report: ${label}`)
    outputParts.push(`File: ${sr.path}`)
    outputParts.push(`════════════════════════════════════════════════════════`)
    outputParts.push("")
    outputParts.push(srContent.trimEnd())
    outputParts.push("")

    if (!options.noCode) {
      const finalRepos = parseReposTable(srContent, dirname(sr.path))
      const refs = findCodeRefs(srContent, finalRepos, sr.path)
      const codeOutput = dedupedCode(refs)
      if (codeOutput.trim()) {
        outputParts.push(`────────────────────────────────────────────────────────`)
        outputParts.push(`Code References from ${sr.label}`)
        outputParts.push(`────────────────────────────────────────────────────────`)
        outputParts.push("")
        outputParts.push(codeOutput.trimEnd())
        outputParts.push("")
      }
    }

    if (perSourceReports.length > 0) {
      const limitLabel = options.topSources > 0 && options.topSources < perSourceReports.length
        ? ` (top ${options.topSources} by score)`
        : ""
      outputParts.push(`────────────────────────────────────────────────────────`)
      outputParts.push(`Per-Source Reports${limitLabel}:`)
      outputParts.push(`────────────────────────────────────────────────────────`)
      outputParts.push("")

      for (const ps of perSourceReports) {
        outputParts.push(`--- ${ps.name} (${ps.score}/10) ---`)
        outputParts.push(`File: ${ps.path}`)
        outputParts.push("")
        const psContent = readReport(ps.path)
        reportLog.push({
          type: "per-source", label: `${ps.name} (${ps.score}/10)`, path: ps.path,
          lines: psContent.split("\n").length, chars: psContent.length,
        })
        outputParts.push(psContent.trimEnd())
        outputParts.push("")

        if (!options.noCode) {
          const finalRepos = parseReposTable(srContent, dirname(sr.path))
          const sourceRepoEntry = finalRepos.find(r => r.name === ps.name)
          const contextRepos = sourceRepoEntry ? [sourceRepoEntry] : finalRepos
          const refs = findCodeRefs(psContent, contextRepos, ps.path)
          const codeOutput = dedupedCode(refs)
          if (codeOutput.trim()) {
            outputParts.push(codeOutput.trimEnd())
            outputParts.push("")
          }
        }
      }
    }
  }

  const finalOutputStr = outputParts.join("\n")
  const totalLines = finalOutputStr.split("\n").length
  const totalChars = finalOutputStr.length
  const estimatedTokens = Math.round(totalChars / 4)

  const evidenceCount = reportLog.filter(r => r.type === "evidence").length
  const finalCount = reportLog.filter(r => r.type === "final").length
  const perSourceCount = reportLog.filter(r => r.type === "per-source").length

  outputParts.push(`════════════════════════════════════════════════════════`)
  outputParts.push(`Bundle Summary`)
  outputParts.push(`════════════════════════════════════════════════════════`)
  outputParts.push(``)
  outputParts.push(`Reports included:`)
  outputParts.push(`  ${evidenceCount} evidence pack(s)`)
  outputParts.push(`  ${finalCount} final report(s)`)
  outputParts.push(`  ${perSourceCount} per-source report(s)`)
  outputParts.push(``)
  outputParts.push(`  Total lines:        ${totalLines.toLocaleString()}`)
  outputParts.push(`  Total characters:   ${totalChars.toLocaleString()}`)
  outputParts.push(`  Estimated tokens:   ${estimatedTokens.toLocaleString()}  (~4 chars/token)`)
  outputParts.push(``)
  outputParts.push(`Code reference resolution:`)
  outputParts.push(`  Total refs found:   ${stats.total}`)
  outputParts.push(`  Rendered unique:    ${stats.rendered}`)
  outputParts.push(`  Duplicates skipped: ${stats.duplicateSkipped}`)
  outputParts.push(`  Resolved:           ${stats.resolved}`)
  outputParts.push(`  Unresolved (total): ${stats.unresolved}`)
  outputParts.push(`    ├─ .md self-refs:  ${stats.unresolvedMdSelfRefs}  (cross-refs to analysis files, not code)`)
  outputParts.push(`    └─ code refs:      ${stats.unresolvedCode}`)
  const pct = stats.total > 0 ? (stats.resolved / stats.total * 100).toFixed(1) : "0.0"
  outputParts.push(`  Resolution rate:    ${pct}%`)
  outputParts.push(``)

  const finalOutput = outputParts.join("\n")

  if (options.outputFile) {
    writeFileSync(options.outputFile, finalOutput, "utf-8")
    console.error(`Evolved output written to ${options.outputFile}`)
  } else {
    console.log(finalOutput)
  }
}

export function showEvolveUsage(): void {
  console.log("  study evolve [--top-sources <N>] [--output <file>] [--no-code] <@evidence-report>...")
  console.log("    Trace evidence packs through final reports, per-source reports, and code.")
  console.log("    --top-sources <N>  Include top N per-source reports by score (default: 5, 0 = all)")
  console.log("    --output <file>    Write output to file instead of stdout")
  console.log("    --no-code          Skip code extraction (reports only)")
  console.log("")
}
