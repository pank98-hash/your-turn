// your-turn: turn a learning point's placeholder state plus its test
// results into a point status. Pure function, node built-ins only.
//
// Judging is simple: green = pass, red = fail. classifyPoint NEVER scores
// writing quality, assigns stars, or reads any expectedRed/expectedGreen.
// The status is decided objectively by the test results + whether the point is
// still a placeholder:
//   - pending     -> the placeholder is still there (not implemented yet)
//   - done        -> implemented and every one of its tests passes
//   - in-progress -> implemented but at least one test fails/errors/unmatched

/**
 * Classify one learning point.
 *
 * A test id in `point.tests` that matches no actual result is reported in
 * `unmatched` (a typo'd id must never be silently dropped). A test that ERRORS
 * (import/syntax failure in the module under test) is reported in `errorTests`,
 * kept separate from ordinary failures in `failedTests`.
 *
 * @param {{ point: string, tests?: string[], meta?: { tests?: string[] } }} point
 * @param {Array<{id:string,status:'pass'|'fail'|'error',detail:string}>} results
 * @param {boolean} pending - whether the placeholder is still present.
 * @returns {{ point: string, status: 'pending'|'done'|'in-progress',
 *   failedTests: string[], errorTests: string[], unmatched: string[] }}
 */
export function classifyPoint(point, results, pending) {
  // The point name is required by the interface; tolerate a missing one so the
  // report can still list the entry rather than crash (Review Focus #2).
  const name = point?.point ?? ''
  const tests = Array.isArray(point?.tests)
    ? point.tests
    : Array.isArray(point?.meta?.tests)
      ? point.meta.tests
      : []

  if (pending) {
    return {
      point: name,
      status: 'pending',
      failedTests: [],
      errorTests: [],
      unmatched: [],
    }
  }

  const statusById = new Map(results.map((r) => [r.id, r.status]))
  const failedTests = []
  const errorTests = []
  const unmatched = []

  for (const id of tests) {
    const status = statusById.get(id)
    if (status === undefined) {
      unmatched.push(id)
    } else if (status === 'error') {
      errorTests.push(id)
    } else if (status === 'fail') {
      failedTests.push(id)
    }
    // 'pass' contributes nothing.
  }

  // A point with no tests (empty/missing tests, RF#2) is simply "not done":
  // there is nothing to judge, so it lists as in-progress rather than done.
  const done = tests.length > 0 && failedTests.length === 0 && errorTests.length === 0 && unmatched.length === 0

  return {
    point: name,
    status: done ? 'done' : 'in-progress',
    failedTests,
    errorTests,
    unmatched,
  }
}

export default { classifyPoint }
