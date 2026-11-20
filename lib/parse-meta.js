// your-turn: parse a `.solutions/*.meta.json` file into a learning
// point's identity. Pure function, node built-ins only — no DSH internals.
//
// A meta file stores only point/tests/hints (no grading/rating fields). The
// shape is the source of truth Tasks 3/4 consume:
//   Meta = { point, module, solution, tests, hints? }
//
// parseMeta never throws: malformed JSON, a missing point, or non-array
// tests/hints all report "not a valid meta" as null.

/**
 * Parse the text of a `.solutions/*.meta.json` file into a Meta object.
 * @param {string} text - raw file contents.
 * @returns {object|null} the parsed Meta, or null when the text is not a
 *   valid meta (non-JSON, missing `point`, or non-array `tests`/`hints`).
 */
export function parseMeta(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null
  if (typeof data.point !== 'string' || data.point === '') return null
  if (typeof data.module !== 'string' || data.module === '') return null
  if (typeof data.solution !== 'string' || data.solution === '') return null

  // A present-but-non-array field is malformed; reject rather than coerce.
  if (data.tests !== undefined && !Array.isArray(data.tests)) return null
  if (data.hints !== undefined && !Array.isArray(data.hints)) return null

  return {
    point: data.point,
    module: data.module,
    solution: data.solution,
    tests: data.tests ?? [],
    hints: data.hints ?? [],
  }
}

export default { parseMeta }
