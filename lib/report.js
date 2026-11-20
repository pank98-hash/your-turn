// your-turn: assemble learning reports from the read-only scan/runner/
// classify pipeline.
//
// report.js NEVER writes files — it only reads the repo through scan.js and
// runner.js and turns the results into the report objects the two Host tools
// (learning_check / learning_status) expose. node built-ins only — no DSH
// internals.
//
// Judging is simple: green = pass, red = fail. No grading, no rating, no
// writing-quality scoring.
import { listPoints, findPlaceholders, isPending } from './scan.js'
import { runTests } from './runner.js'
import { classifyPoint } from './classify.js'

/**
 * Build the shared per-point classification table for a repo.
 *
 * Runs the test suite once (via runner.runTests) and classifies every learning
 * point. `pending` is resolved per point by checking whether its name is still
 * raised as a placeholder (scan.isPending), exactly as classifyPoint expects.
 *
 * @param {string} cwd - repo root.
 * @param {string} python - python interpreter.
 * @returns {Promise<Array<{point,module,solution,status,failedTests,errorTests,unmatched}>>}
 *   one row per point.
 */
async function buildPointRows(cwd, python) {
  const [points, placeholders, results] = await Promise.all([
    listPoints(cwd),
    findPlaceholders(cwd),
    runTests(cwd, python),
  ])
  return points.map((point) => {
    const pending = isPending(point.point, placeholders)
    // Spread the full classifyPoint result so failedTests / errorTests /
    // unmatched survive alongside point/module/solution/status (Review Focus
    // #4 + #5): a typo'd test id and a module-breaking ERROR must reach the
    // user, not be silently dropped.
    const classified = classifyPoint(point, results, pending)
    return {
      point: point.point,
      module: point.module,
      solution: point.solution,
      ...classified,
    }
  })
}

/**
 * Assemble the check report: per-point statuses plus a summary.
 *
 * @param {string} cwd - repo root.
 * @param {string} python - python interpreter.
 * @param {{mode?: 'run'|'summary', point?: string}} [opts] - `mode: 'summary'`
 *   trims each point to `{point, status}`; `point` filters to one point.
 * @returns {Promise<{points: object[], summary: {total,pending,done,inProgress,errors,unmatched}}>}
 */
export async function buildCheckReport(cwd, python = 'python3', opts = {}) {
  const mode = opts.mode === 'summary' ? 'summary' : 'run'
  const filter = typeof opts.point === 'string' && opts.point !== '' ? opts.point : null

  let rows = await buildPointRows(cwd, python)
  if (filter !== null) rows = rows.filter((row) => row.point === filter)

  const summary = {
    total: rows.length,
    pending: rows.filter((row) => row.status === 'pending').length,
    done: rows.filter((row) => row.status === 'done').length,
    inProgress: rows.filter((row) => row.status === 'in-progress').length,
    errors: rows.reduce((n, row) => n + (row.errorTests?.length ?? 0), 0),
    unmatched: rows.reduce((n, row) => n + (row.unmatched?.length ?? 0), 0),
  }

  const points = mode === 'summary'
    ? rows.map(({ point, status }) => ({ point, status }))
    : rows

  return { points, summary }
}

/**
 * Assemble the status report: per-point statuses.
 *
 * @param {string} cwd - repo root.
 * @param {string} python - python interpreter.
 * @param {{point?: string}} [opts] - `point` filters to one point.
 * @returns {Promise<{points: Array<{point,module,solution,status}>}>}
 */
export async function buildStatusReport(cwd, python = 'python3', opts = {}) {
  const filter = typeof opts.point === 'string' && opts.point !== '' ? opts.point : null

  let rows = await buildPointRows(cwd, python)
  if (filter !== null) rows = rows.filter((row) => row.point === filter)

  return { points: rows }
}

export default { buildCheckReport, buildStatusReport }
