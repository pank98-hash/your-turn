// Tests for runner.js — spawns `python -m unittest discover -v` (from a
// `tests/` dir when present, else the repo root) and parses the `-v` output.
//
// runner.js is a pure-function module: node built-ins only, no DSH internals.
// A non-zero exit code from unittest (tests failing) is NOT an error; the
// parser always runs over stdout.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, mkdir, writeFile, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { runTests, parseVerboseOutput } from '../lib/runner.js'

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'test',
  'fixtures',
  'unittest-verbose.txt',
)

// Writes a fake `python` executable into `dir` that records its argv+cwd to a
// JSON file (via RECORD_FILE env) and prints the given `-v` lines to stdout.
// Returns the record path the test reads back to assert the exact command.
async function makeFakePython(dir, lines, exitCode = 0, stderrLines = []) {
  const recordPath = join(dir, 'record.json')
  const fakePython = join(dir, 'fake-python')
  const script = [
    '#!/usr/bin/env node',
    "const { writeFileSync } = require('node:fs')",
    'writeFileSync(process.env.RECORD_FILE, JSON.stringify({',
    '  argv: process.argv.slice(2),',
    '  cwd: process.cwd(),',
    '}))',
    ...lines.map((l) => `process.stdout.write(${JSON.stringify(`${l}\n`)})`),
    // unittest's TextTestRunner writes the verbose report to STDERR.
    ...stderrLines.map((l) => `process.stderr.write(${JSON.stringify(`${l}\n`)})`),
    // exitCode (not exit()) lets stdout/stderr flush to the pipe before the
    // process ends, so a non-zero exit still delivers its output for parsing.
    `process.exitCode = ${exitCode}`,
  ].join('\n')
  await writeFile(fakePython, script)
  await chmod(fakePython, 0o755)
  process.env.RECORD_FILE = recordPath
  return recordPath
}

test('parseVerboseOutput rebuilds ids and maps ok/FAIL/ERROR statuses', async () => {
  const stdout = await readFile(fixturePath, 'utf8')
  const results = parseVerboseOutput(stdout)

  const ids = results.map((r) => r.id)
  assert.deepEqual(ids, [
    'tests.test_utils.TestEuler.test_euler2rotmat_z90',
    'tests.test_utils.TestQuat.test_quat2rotmat_identity',
    'tests.test_utils.TestQuat.test_quat2rotmat_z90',
    'tests.test_utils.TestQuat.test_quat2rotmat_orthogonal',
    'tests.test_utils.TestQuat.test_quat2rotmat_roundtrip',
  ])

  const byId = Object.fromEntries(results.map((r) => [r.id, r]))
  assert.equal(byId['tests.test_utils.TestEuler.test_euler2rotmat_z90'].status, 'pass')
  assert.equal(byId['tests.test_utils.TestQuat.test_quat2rotmat_identity'].status, 'pass')
  assert.equal(byId['tests.test_utils.TestQuat.test_quat2rotmat_roundtrip'].status, 'pass')

  // FAIL -> fail (never mixed with error)
  assert.equal(byId['tests.test_utils.TestQuat.test_quat2rotmat_z90'].status, 'fail')
  // ERROR -> error (kept separate from fail; Review Focus #5)
  assert.equal(byId['tests.test_utils.TestQuat.test_quat2rotmat_orthogonal'].status, 'error')
})

test('parseVerboseOutput captures indented detail for FAIL and ERROR, empty for ok', async () => {
  const stdout = await readFile(fixturePath, 'utf8')
  const results = parseVerboseOutput(stdout)
  const byId = Object.fromEntries(results.map((r) => [r.id, r]))

  // A passing test has no detail.
  assert.equal(byId['tests.test_utils.TestQuat.test_quat2rotmat_identity'].detail, '')

  // FAIL detail carries the assertion traceback.
  assert.match(
    byId['tests.test_utils.TestQuat.test_quat2rotmat_z90'].detail,
    /AssertionError/,
  )
  // ERROR detail carries the NotImplementedError (module import/raise) traceback.
  assert.match(
    byId['tests.test_utils.TestQuat.test_quat2rotmat_orthogonal'].detail,
    /NotImplementedError/,
  )
})

test('parseVerboseOutput returns [] for empty / 0-test output (Review Focus #3)', () => {
  assert.deepEqual(parseVerboseOutput(''), [])
  // A directory with no discovered tests: unittest prints only the summary.
  assert.deepEqual(
    parseVerboseOutput('----------------------------------------------------------------------\nRan 0 tests in 0.000s\n\nOK\n'),
    [],
  )
})

test('parseVerboseOutput handles Python 3.12 docstring format without id duplication', () => {
  // Python 3.12 with a docstringed method puts the FULL id in the parens.
  const stdout = 'test_x (mod.Cls.test_x) ... ERROR\n'
  const results = parseVerboseOutput(stdout)
  assert.deepEqual(
    results.map((r) => [r.id, r.status]),
    [['mod.Cls.test_x', 'error']],
  )
})

test('parseVerboseOutput ignores a spilled CJK docstring line', () => {
  // The docstring text spills onto the next line; it must NOT be parsed as a
  // separate test (its leading token is not a Python identifier).
  const stdout = [
    'test_x (mod.Cls.test_x) ... ERROR',
    '末端沿 -z 下降 5cm ... ERROR',
  ].join('\n')
  const results = parseVerboseOutput(stdout)
  assert.deepEqual(
    results.map((r) => [r.id, r.status]),
    [['mod.Cls.test_x', 'error']],
  )
})

test('parseVerboseOutput still parses classic module.Class format', () => {
  const stdout = 'test_x (mod.Cls) ... ok\n'
  const results = parseVerboseOutput(stdout)
  assert.deepEqual(
    results.map((r) => [r.id, r.status]),
    [['mod.Cls.test_x', 'pass']],
  )
})

test('runTests discovers from tests/ dir when it exists', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ftb-runner-'))
  await mkdir(join(dir, 'tests'))
  const recordPath = await makeFakePython(dir, [
    'test_one (tests.test_mod.TestA) ... ok',
    'test_two (tests.test_mod.TestA) ... FAIL',
  ])

  const results = await runTests(dir, join(dir, 'fake-python'))

  const recorded = JSON.parse(await readFile(recordPath, 'utf8'))
  assert.deepEqual(recorded.argv, ['-m', 'unittest', 'discover', '-s', 'tests', '-v'])
  assert.equal(recorded.cwd, dir)

  assert.deepEqual(
    results.map((r) => [r.id, r.status]),
    [
      ['tests.test_mod.TestA.test_one', 'pass'],
      ['tests.test_mod.TestA.test_two', 'fail'],
    ],
  )
})

test('runTests discovers from repo root when no tests/ dir exists', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ftb-runner-'))
  const recordPath = await makeFakePython(dir, [
    'test_self_consistency (test_dual_arm_coord.TestIKArm) ... ok',
  ])

  const results = await runTests(dir, join(dir, 'fake-python'))

  const recorded = JSON.parse(await readFile(recordPath, 'utf8'))
  // Root discovery: no `-s tests` — id rebuilds without the `tests.` prefix.
  assert.deepEqual(recorded.argv, ['-m', 'unittest', 'discover', '-v'])
  assert.equal(recorded.cwd, dir)

  assert.deepEqual(
    results.map((r) => [r.id, r.status]),
    [['test_dual_arm_coord.TestIKArm.test_self_consistency', 'pass']],
  )
})

test('runTests parses verbose results written to stderr (unittest writes to stderr)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ftb-runner-'))
  await mkdir(join(dir, 'tests'))
  // The verbose `ok|FAIL|ERROR` report goes to stderr, not stdout.
  await makeFakePython(
    dir,
    [],
    0,
    [
      'test_self_consistency (tests.test_mod.TestA) ... ok',
      'test_broken (tests.test_mod.TestA) ... ERROR',
    ],
  )

  const results = await runTests(dir, join(dir, 'fake-python'))
  assert.deepEqual(
    results.map((r) => [r.id, r.status]),
    [
      ['tests.test_mod.TestA.test_self_consistency', 'pass'],
      ['tests.test_mod.TestA.test_broken', 'error'],
    ],
  )
})

test('runTests tolerates a non-zero exit code (failing tests) and still parses', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ftb-runner-'))
  await makeFakePython(dir, ['test_broken (tests.test_mod.TestA) ... ERROR'], 1)

  // Must NOT throw even though the fake python exits 1.
  const results = await runTests(dir, join(dir, 'fake-python'))
  assert.deepEqual(
    results.map((r) => [r.id, r.status]),
    [['tests.test_mod.TestA.test_broken', 'error']],
  )
})

test('runTests kills a non-terminating child and resolves a timeout result', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ftb-runner-'))
  // A fake python that never exits (simulates `while True`).
  await writeFile(join(dir, 'fake-python'), '#!/usr/bin/env node\nsetInterval(() => {}, 1000)\n')
  await chmod(join(dir, 'fake-python'), 0o755)

  const results = await runTests(dir, join(dir, 'fake-python'), 300)

  assert.equal(results.length, 1)
  assert.equal(results[0].id, `${dir}:timeout`)
  assert.equal(results[0].status, 'error')
  assert.equal(results[0].detail, 'timed out after 300ms')
})

test('parseVerboseOutput attaches detail for the Python 3.12 docstring header', () => {
  // 3.12 docstring format: the test line AND the detail header both carry the
  // full id `mod.Cls.test_x`. The detail pass must normalize the header the
  // same way (not look up `mod.Cls.test_x.test_x`) and attach the traceback.
  const stdout = [
    'test_x (mod.Cls.test_x) ... ERROR',
    '======================================================================',
    'ERROR: test_x (mod.Cls.test_x)',
    '----------------------------------------------------------------------',
    'Traceback (most recent call last):',
    '  File "t.py", line 1, in test_x',
    '    raise RuntimeError("boom")',
    'RuntimeError: boom',
  ].join('\n')
  const results = parseVerboseOutput(stdout)
  assert.equal(results.length, 1)
  assert.equal(results[0].id, 'mod.Cls.test_x')
  assert.equal(results[0].status, 'error')
  assert.match(results[0].detail, /RuntimeError: boom/)
})
