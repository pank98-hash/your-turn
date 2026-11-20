// your-turn: run `python -m unittest discover -v` in a repo and parse the
// verbose output into per-test results.
//
// runner.js NEVER writes files and never treats a failing test (non-zero exit
// code) as an error: tests failing is the expected signal. node built-ins only.
import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'

// A test line in `unittest -v` output: `test_name (module.Class) ... ok|FAIL|ERROR`.
// Python 3.12 changes this when the method has a docstring: the parens then
// carry the FULL id (`module.Class.test_name`) and the docstring spills onto a
// following line. The leading token is gated to a Python identifier so a spilled
// CJK docstring line is never treated as a test line.
const TEST_LINE_RE = /^([A-Za-z_]\w*) \((.+?)\) \.\.\. (ok|FAIL|ERROR)$/

// A failure/error block header. `unittest -v` prints it as two lines:
//   `===...` then `FAIL: test_name (module.Class)` then `---...`.
const DETAIL_HEADER_RE = /^(FAIL|ERROR):\s*(\S+)\s+\((.+?)\)\s*$/

const STATUS_MAP = { ok: 'pass', FAIL: 'fail', ERROR: 'error' }

/**
 * Parse `python -m unittest discover -s tests -v` stdout into test results.
 *
 * Rebuilds each test id as `<modulePath>.<method>` (e.g. a line
 * `test_x (tests.test_mod.TestA) ... ok` -> `tests.test_mod.TestA.test_x`).
 * `ok` -> `pass`, `FAIL` -> `fail`, `ERROR` -> `error`. The `detail` of a
 * fail/error is the indented traceback that `unittest` prints under its
 * `=== FAIL:` / `=== ERROR:` header block.
 *
 * @param {string} stdout - raw stdout from the verbose run.
 * @returns {Array<{id:string,status:'pass'|'fail'|'error',detail:string}>}
 */
export function parseVerboseOutput(stdout) {
  const results = []
  const lines = String(stdout).split('\n')

  // First pass: collect every test line, keeping order. Index results by id so
  // the detail pass below can attach tracebacks to the right test.
  const byId = new Map()
  for (const line of lines) {
    const m = TEST_LINE_RE.exec(line)
    if (!m) continue
    const [, method, modulePath, rawStatus] = m
    // Classic format: parens hold `module.Class`, id = `module.Class.method`.
    // Python 3.12 docstring format: parens hold `module.Class.method` already —
    // don't append the method again.
    const id = modulePath.endsWith(`.${method}`) ? modulePath : `${modulePath}.${method}`
    const result = { id, status: STATUS_MAP[rawStatus], detail: '' }
    results.push(result)
    byId.set(result.id, result)
  }

  // Second pass: attach the indented traceback under each `=== ...` /
  // `FAIL: name (module.Class)` / `ERROR: name (module.Class)` header to its
  // matching result.
  for (let i = 0; i < lines.length; i++) {
    const m = DETAIL_HEADER_RE.exec(lines[i])
    if (!m) continue
    const [, rawStatus, method, modulePath] = m
    // Same id-normalization as the test-line pass: Python 3.12 docstring
    // headers carry the full id (`mod.Cls.test_x`), so don't append the method
    // again (Review Focus: `mod.Cls.test_x.test_x` would never match).
    const targetId = modulePath.endsWith(`.${method}`)
      ? modulePath
      : `${modulePath}.${method}`
    const target = byId.get(targetId)
    if (!target || target.status !== STATUS_MAP[rawStatus]) continue

    const detailLines = []
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j]
      // `===...` opens the next block; `---...` is either the header's own
      // separator (skip it) or the summary footer before "Ran N tests".
      if (/^={5,}/.test(line)) break
      if (/^-{5,}/.test(line)) {
        if (detailLines.length === 0) continue
        break
      }
      detailLines.push(line)
    }
    target.detail = detailLines.join('\n').trim()
  }

  return results
}

/**
 * Run the test suite in `cwd` and return the parsed per-test results.
 *
 * Discovers tests from a `tests/` subdirectory when one exists, otherwise from
 * the repo root (which finds `test_*.py` at the root). A non-zero exit code is
 * expected when tests fail, so it is NOT an error: stdout is always parsed.
 * An empty suite (0 discovered tests) parses to `[]`.
 *
 * @param {string} cwd - repo root to run tests from.
 * @param {string} python - python interpreter (default 'python3').
 * @param {number} [timeoutMs=60000] - kill the child after this many ms and
 *   surface a synthetic error result instead of hanging forever (Review
 *   Focus: a non-terminating learner impl must not wedge the tool).
 * @returns {Promise<Array<{id:string,status:string,detail:string}>>}
 */
export async function runTests(cwd, python = 'python3', timeoutMs = 60000) {
  // A learning repo may keep tests in a `tests/` dir (e.g. mujoco-tutorials) or
  // at the repo root. `discover -s tests` on a root that has no `tests/` dir
  // raises `ImportError: Start directory is not importable`, so pick the start
  // dir dynamically based on a read-only existence check.
  let args = ['-m', 'unittest', 'discover', '-v']
  try {
    const s = await stat(join(cwd, 'tests'))
    if (s.isDirectory()) {
      args = ['-m', 'unittest', 'discover', '-s', 'tests', '-v']
    }
  } catch {
    // No `tests/` entry (or unreadable): discover from the repo root.
  }

  return new Promise((resolve, reject) => {
    const child = spawn(python, args, {
      cwd,
    })
    let stdout = ''
    let stderr = ''

    // Kill a non-terminating suite (e.g. `while True`) after `timeoutMs` and
    // resolve with an explicit error result rather than hanging or rejecting.
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve([
        {
          id: `${cwd}:timeout`,
          status: 'error',
          detail: `timed out after ${timeoutMs}ms`,
        },
      ])
    }, timeoutMs)

    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', () => {
      clearTimeout(timer)
      // Tests failing is a non-zero exit; that is a normal, expected outcome.
      // unittest's TextTestRunner writes the verbose report to stderr, but some
      // setups may also print to stdout — merge both streams before parsing.
      resolve(parseVerboseOutput(stdout + '\n' + stderr))
    })
  })
}

export default { runTests, parseVerboseOutput }
