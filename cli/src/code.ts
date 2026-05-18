import { readFileSync, existsSync, writeFileSync, readdirSync, statSync } from "fs"
import { resolve, relative, basename, dirname, sep, isAbsolute } from "path"

const ULTRAPLAN_ROOT = resolve(import.meta.dirname, "../..")

export interface RepoEntry {
  name: string
  path: string
}

export interface CodeRef {
  repoName: string
  fullPath: string
  filePath: string
  lineSpec: string
  sourceReport: string
}

const CODE_REF_RE = /`([a-zA-Z_/][\w./-]*\.[a-zA-Z]\w*):(\d+(?:[-–,]\d+)*)`/g
const REPO_TABLE_LINE_RE = /^\|\s*\d+\s*\|\s*([^|]+?)\s*\|\s*`([^`]+)`\s*\|/

export function parseReposTable(content: string, basePath?: string): RepoEntry[] {
  const repos: RepoEntry[] = []
  for (const line of content.split("\n")) {
    const m = line.match(REPO_TABLE_LINE_RE)
    if (m) {
      let repoPath = m[2].trim()
      if (!isAbsolute(repoPath)) {
        if (basePath) {
          const resolved = resolve(basePath, repoPath)
          if (existsSync(resolved)) {
            repoPath = resolved
          } else if (repoPath.startsWith("repos/") || repoPath.startsWith("../")) {
            const studyMatch = basePath.match(/\/studies\/([^/]+)/)
            if (studyMatch) {
              const studyName = studyMatch[1]
              const altBase = resolve(ULTRAPLAN_ROOT, "..", studyName)
              const altPath = resolve(altBase, repoPath)
              if (existsSync(altPath)) {
                repoPath = altPath
              }
            }
          }
        }
      }
      repos.push({ name: m[1].trim(), path: repoPath })
    }
  }
  return repos
}

export function findCodeRefs(content: string, repos: RepoEntry[], reportPath: string): CodeRef[] {
  const seen = new Set<string>()
  const refs: CodeRef[] = []
  let match

  while ((match = CODE_REF_RE.exec(content)) !== null) {
    const filePath = match[1]
    const lineSpec = match[2]

    const key = `${filePath}:${lineSpec}`
    if (seen.has(key)) continue
    seen.add(key)

    let resolved = false
    for (const repo of repos) {
      const candidates = [resolve(repo.path, filePath)]
      const firstSlash = filePath.indexOf("/")
      if (firstSlash > 0) {
        candidates.push(resolve(repo.path, filePath.slice(firstSlash + 1)))
      }
      for (const fullPath of candidates) {
        if (existsSync(fullPath)) {
          refs.push({ repoName: repo.name, fullPath, filePath, lineSpec, sourceReport: reportPath })
          resolved = true
          break
        }
      }
      if (resolved) break
    }

    if (!resolved) {
      const fileName = basename(filePath)
      for (const repo of repos) {
        const found = searchFileInRepo(repo.path, fileName)
        if (found) {
          const rel = relative(repo.path, found)
          refs.push({ repoName: repo.name, fullPath: found, filePath: rel, lineSpec, sourceReport: reportPath })
          resolved = true
          break
        }
      }
    }

    if (!resolved) {
      refs.push({ repoName: "???", fullPath: "", filePath, lineSpec, sourceReport: reportPath })
    }
  }

  return refs
}

const SEARCH_CACHE = new Map<string, string | null>()

function searchFileInRepo(repoPath: string, fileName: string): string | null {
  const cacheKey = `${repoPath}::${fileName}`
  const cached = SEARCH_CACHE.get(cacheKey)
  if (cached !== undefined) return cached

  const search = (dir: string): string | null => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return null
    }
    for (const entry of entries) {
      const full = resolve(dir, entry)
      try {
        if (statSync(full).isDirectory()) {
          if (!entry.startsWith(".") && entry !== "node_modules" && entry !== ".git") {
            const result = search(full)
            if (result) return result
          }
        } else if (entry === fileName) {
          return full
        }
      } catch {
        continue
      }
    }
    return null
  }

  const result = search(repoPath)
  SEARCH_CACHE.set(cacheKey, result)
  return result
}

export function readCode(ref: CodeRef): string {
  if (!ref.fullPath) {
    return `// ??? ${ref.filePath}:${ref.lineSpec} (unresolved)\n\n`
  }

  const content = readFileSync(ref.fullPath, "utf-8")
  const lines = content.split("\n")

  let startLine = 1
  let endLine = lines.length

  if (ref.lineSpec.includes("–")) {
    const parts = ref.lineSpec.split("–")
    startLine = parseInt(parts[0], 10) || 1
    endLine = parseInt(parts[1], 10) || lines.length
  } else if (ref.lineSpec.includes("-")) {
    const parts = ref.lineSpec.split("-")
    startLine = parseInt(parts[0], 10) || 1
    endLine = parseInt(parts[1], 10) || lines.length
  } else if (ref.lineSpec.includes(",")) {
    const nums = ref.lineSpec.split(",").map(s => parseInt(s, 10)).filter(n => !isNaN(n))
    startLine = Math.min(...nums)
    endLine = Math.max(...nums)
  } else {
    const n = parseInt(ref.lineSpec, 10)
    if (!isNaN(n)) {
      startLine = n
      endLine = Math.min(lines.length, n + 20)
    }
  }

  startLine = Math.max(1, startLine)
  endLine = Math.min(lines.length, endLine)

  const selected = lines.slice(startLine - 1, endLine)
  const header = `// ${ref.repoName} / ${ref.filePath}:${ref.lineSpec}`
  const code = selected.map((line, i) => `${startLine + i}  ${line}`).join("\n")

  return `${header}\n${code}\n\n`
}

export function processReports(reportPaths: string[]): string {
  const allRefs: CodeRef[] = []

  for (const rp of reportPaths) {
    const content = readFileSync(rp, "utf-8")
    const reportDir = dirname(rp)
    const repos = parseReposTable(content, reportDir)
    if (repos.length === 0) {
      console.error(`Warning: no repo table found in ${rp}`)
    }
    const refs = findCodeRefs(content, repos, rp)
    const unresolved = refs.filter(r => r.repoName === "???")
    if (unresolved.length > 0) {
      console.error(`Warning: ${unresolved.length} unresolved reference(s) in ${rp}:`)
      for (const u of unresolved) {
        console.error(`  ${u.filePath}:${u.lineSpec}`)
      }
    }
    allRefs.push(...refs)
  }

  return allRefs.map(readCode).join("")
}
