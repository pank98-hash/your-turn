// Tests for scan.js — the read-only scanner that walks a learning repo and
// turns `.solutions/*.meta.json` + placeholder raises into learning points.
//
// scan.js must never write files; it only reads the tree under `cwd`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { listPoints, findPlaceholders, isPending } from '../lib/scan.js'

const fixturesRepo = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures', 'repo')

test('listPoints finds the single fixture learning point', async () => {
  const points = await listPoints(fixturesRepo)
  assert.equal(points.length, 1)
  const [p] = points
  assert.equal(p.point, 'quat2rotmat')
  assert.equal(p.module, 'src.utils')
  assert.equal(p.solution, '.solutions/src_utils_quat2rotmat.py')
  assert.ok(p.metaPath.endsWith('.solutions/src_utils_quat2rotmat.meta.json'))
  assert.equal(p.meta.point, 'quat2rotmat')
  assert.deepEqual(p.meta.tests, ['test_identity', 'test_normalized'])
})

test('findPlaceholders extracts the raised NotImplementedError name', async () => {
  const placeholders = await findPlaceholders(fixturesRepo)
  // quat2rotmat (src/utils.py) and ik_arm (dual_arm_coord.py at repo root);
  // order is not part of the contract.
  assert.deepEqual(new Set(placeholders), new Set(['quat2rotmat', 'ik_arm']))
})

test('findPlaceholders finds a hollowed file at the repo root', async () => {
  const placeholders = await findPlaceholders(fixturesRepo)
  assert.ok(placeholders.includes('ik_arm'), 'root-level dual_arm_coord.py must be scanned')
})

test('findPlaceholders does not report placeholders inside .solutions/', async () => {
  const placeholders = await findPlaceholders(fixturesRepo)
  assert.ok(!placeholders.includes('solved_helper'), '.solutions/*.py must be excluded')
})

test('isPending matches a point whose name is still a placeholder', () => {
  assert.equal(isPending('quat2rotmat', ['quat2rotmat']), true)
  assert.equal(isPending('other', ['quat2rotmat']), false)
})

test('findPlaceholders collects ALL points in a multi-placeholder file (1-3 per file)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ftb-scan-'))
  await writeFile(
    join(dir, 'mod.py'),
    [
      'def a(q):',
      '    raise NotImplementedError("point_a —— 等你来实现")',
      '',
      'def b(q):',
      '    raise NotImplementedError("point_b —— 等你来实现")',
      '',
    ].join('\n'),
  )

  const placeholders = await findPlaceholders(dir)
  assert.deepEqual(new Set(placeholders), new Set(['point_a', 'point_b']))
})
