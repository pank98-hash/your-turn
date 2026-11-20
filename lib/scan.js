// your-turn: read-only scanning of a learning repo into learning
// points and the placeholder names that mark unimplemented work.
//
// scan.js NEVER writes files; it only reads `.solutions/*.meta.json` and the
// repo's `*.py` files (recursively, excluding `.solutions/`, `tests/`, and
// `__pycache__/`). node built-ins only — no DSH internals.
//
// Placeholder convention: a function body is only
//   raise NotImplementedError("<名字> —— 等你来实现")
// and the point name is the `<名字>` before the ` —— 等你来实现` suffix.

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseMeta } from './parse-meta.js'

/**
 * The regex that extracts a learning-point name from a placeholder raise.
 * The convention `<名字> —— 等你来实现` puts the point name before the ` —— `
 * separator, so the capture stops there rather than grabbing the whole string.
 */
const PLACEHOLDER_RE = /raise\s+NotImplementedError\(["']([^"']+?)(?:\s*——[^"']*)?["']/g

/**
 * Directory names that must never be scanned for placeholders, at any depth:
 * standard solutions (`.solutions/`), tests (`tests/` — their fixtures may
 * raise NotImplementedError on purpose), and Python bytecode cache dirs.
 */
const EXCLUDED_DIRS = new Set(['.solutions', 'tests', '__pycache__'])

/** Recursively collect every `*.py` file under `cwd`, skipping excluded dirs. */
async function collectPyFiles(cwd) {
  const out = []
  let entries
  try {
    entries = await readdir(cwd, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = join(cwd, entry.name)
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue
      out.push(...(await collectPyFiles(full)))
    } else if (entry.isFile() && entry.name.endsWith('.py')) {
      out.push(full)
    }
  }
  return out
}

/**
 * Enumerate every learning point described under `cwd/.solutions/*.meta.json`.
 * @param {string} cwd - repo root.
 * @returns {Promise<Array<{point,module,solution,metaPath,meta}>>} the points.
 */
export async function listPoints(cwd) {
  const solutionsDir = join(cwd, '.solutions')
  let entries
  try {
    entries = await readdir(solutionsDir, { withFileTypes: true })
  } catch {
    return []
  }
  const points = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.meta.json')) continue
    const metaPath = join(solutionsDir, entry.name)
    let text
    try {
      text = await readFile(metaPath, 'utf8')
    } catch {
      continue
    }
    const meta = parseMeta(text)
    if (meta === null) continue
    points.push({
      point: meta.point,
      module: meta.module,
      solution: meta.solution,
      metaPath,
      meta,
    })
  }
  return points
}

/**
 * Find every placeholder name still raised across the whole repo's `*.py`
 * files (recursively), excluding `.solutions/`, `tests/`, and `__pycache__/`
 * directories. A hollowed file may sit at the repo root, not just under
 * `src/`/`tutorials/`.
 * @param {string} cwd - repo root.
 * @returns {Promise<string[]>} the extracted placeholder names.
 */
export async function findPlaceholders(cwd) {
  const files = await collectPyFiles(cwd)
  const names = []
  for (const file of files) {
    let text
    try {
      text = await readFile(file, 'utf8')
    } catch {
      continue
    }
    // A file may hold 1–3 learning points (per SKILL.md), so collect EVERY
    // placeholder name in the file, not just the first match.
    let match
    while ((match = PLACEHOLDER_RE.exec(text)) !== null) {
      names.push(match[1])
    }
  }
  return names
}

/**
 * Whether a learning point is still pending: its name appears among the
 * placeholder names the source tree still raises.
 * @param {string} point - the learning point name.
 * @param {string[]} placeholders - names from findPlaceholders.
 * @returns {boolean} true when the point is still a placeholder.
 */
export function isPending(point, placeholders) {
  return placeholders.includes(point)
}

export default { listPoints, findPlaceholders, isPending }
