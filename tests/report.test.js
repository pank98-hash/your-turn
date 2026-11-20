// Tests for report.js — pure report assembly over the scan/runner/classify
// pipeline. report.js only READS the repo (via scan.js + runner.js) and never
// writes files; it stays DSH-free (node built-ins only), so these tests must
// not import any DSH internals.
//
// The fixture repo `test/fixtures/repo` carries one hollowed point
// (`quat2rotmat` still raises NotImplementedError), so `runTests` is stubbed
// out — report.js must accept the results it is handed, and running the real
// unittest suite is out of scope here (it is covered by runner.test.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdtemp, mkdir, writeFile, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as scan from '../lib/scan.js'
import * as classify from '../lib/classify.js'
import * as report from '../lib/report.js'

const fixturesRepo = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures', 'repo')

// report.js reads scan.js and classify.js by direct import; we only stub
// runner.runTests because spawning python inside a unit test is covered
// elsewhere and the fixture repo has no tests/ tree to discover anyway.

test('buildCheckReport returns points[] + summary{total,pending,done,inProgress}', async () => {
  const r = await report.buildCheckReport(fixturesRepo, 'python3')

  assert.ok(Array.isArray(r.points))
  assert.equal(r.points.length, 1)

  const summary = r.summary
  assert.equal(typeof summary, 'object')
  assert.deepEqual(Object.keys(summary).sort(), ['done', 'errors', 'inProgress', 'pending', 'total', 'unmatched'])
  assert.equal(typeof summary.total, 'number')
  assert.equal(typeof summary.pending, 'number')
  assert.equal(typeof summary.done, 'number')
  assert.equal(typeof summary.inProgress, 'number')
  assert.equal(typeof summary.errors, 'number')
  assert.equal(typeof summary.unmatched, 'number')

  // One hollowed point: total 1, pending 1, none done/in-progress.
  assert.equal(summary.total, 1)
  assert.equal(summary.pending, 1)
  assert.equal(summary.done, 0)
  assert.equal(summary.inProgress, 0)
  assert.equal(summary.errors, 0)
  assert.equal(summary.unmatched, 0)
})

test('buildCheckReport marks the pending fixture point status "pending"', async () => {
  const r = await report.buildCheckReport(fixturesRepo, 'python3')
  const [p] = r.points
  assert.equal(p.point, 'quat2rotmat')
  assert.equal(p.status, 'pending')
})

test('buildCheckReport mode summary keeps only {point,status} per point', async () => {
  const r = await report.buildCheckReport(fixturesRepo, 'python3', { mode: 'summary' })
  const [p] = r.points
  assert.deepEqual(Object.keys(p).sort(), ['point', 'status'])
  assert.equal(p.point, 'quat2rotmat')
  assert.equal(p.status, 'pending')
})

test('buildCheckReport point filter keeps only the named point', async () => {
  const r = await report.buildCheckReport(fixturesRepo, 'python3', { point: 'quat2rotmat' })
  assert.equal(r.points.length, 1)
  assert.equal(r.summary.total, 1)

  const none = await report.buildCheckReport(fixturesRepo, 'python3', { point: 'does-not-exist' })
  assert.equal(none.points.length, 0)
  assert.equal(none.summary.total, 0)
})

test('buildStatusReport returns points[] each {point,module,solution,status}', async () => {
  const r = await report.buildStatusReport(fixturesRepo, 'python3')
  assert.ok(Array.isArray(r.points))
  assert.equal(r.points.length, 1)

  const [p] = r.points
  assert.deepEqual(Object.keys(p).sort(), ['errorTests', 'failedTests', 'module', 'point', 'solution', 'status', 'unmatched'])
  assert.equal(p.point, 'quat2rotmat')
  assert.equal(p.module, 'src.utils')
  assert.equal(p.solution, '.solutions/src_utils_quat2rotmat.py')
  assert.equal(p.status, 'pending')
  assert.deepEqual(p.failedTests, [])
  assert.deepEqual(p.errorTests, [])
  assert.deepEqual(p.unmatched, [])
})

test('buildStatusReport point filter keeps only the named point', async () => {
  const r = await report.buildStatusReport(fixturesRepo, 'python3', { point: 'does-not-exist' })
  assert.deepEqual(r.points, [])
})

test('report output preserves failedTests/errorTests/unmatched from classifyPoint (Review Focus #4+#5)', async () => {
  // Build a temp repo with one IMPLEMENTED point (no placeholder raise) whose
  // meta lists three tests: one that FAILs, one that ERRORs, and one typo'd id
  // that matches nothing. A fake `python` prints the two real results; the
  // report must carry failedTests/errorTests/unmatched through to the user.
  const dir = await mkdtemp(join(tmpdir(), 'ftb-report-'))

  const meta = {
    point: 'dual_arm_ik',
    module: 'src.ik',
    solution: '.solutions/src_ik.py',
    tests: [
      'tests.test_ik.TestIK.test_fail',
      'tests.test_ik.TestIK.test_error',
      'tests.test_ik.TestIK.test_typo',
    ],
  }
  await mkdir(join(dir, '.solutions'), { recursive: true })
  await writeFile(
    join(dir, '.solutions', 'src_ik.meta.json'),
    JSON.stringify(meta),
  )
  // Implemented point: no NotImplementedError raise anywhere.
  await writeFile(join(dir, 'ik.py'), 'def solve(q):\n    return q\n')

  // Fake python: prints one FAIL and one ERROR test line, then exits 0.
  const fakePython = join(dir, 'fake-python')
  const script = [
    '#!/usr/bin/env node',
    'process.stdout.write("test_fail (tests.test_ik.TestIK) ... FAIL\\n")',
    'process.stdout.write("test_error (tests.test_ik.TestIK) ... ERROR\\n")',
  ].join('\n')
  await writeFile(fakePython, script)
  await chmod(fakePython, 0o755)

  const r = await report.buildCheckReport(dir, join(dir, 'fake-python'))
  const [p] = r.points

  assert.equal(p.point, 'dual_arm_ik')
  assert.equal(p.status, 'in-progress')
  assert.deepEqual(p.failedTests, ['tests.test_ik.TestIK.test_fail'])
  assert.deepEqual(p.errorTests, ['tests.test_ik.TestIK.test_error'])
  assert.deepEqual(p.unmatched, ['tests.test_ik.TestIK.test_typo'])

  // The summary now surfaces these too.
  assert.equal(r.summary.errors, 1)
  assert.equal(r.summary.unmatched, 1)
})
