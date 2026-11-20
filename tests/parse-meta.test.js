// Tests for parse-meta.js — the pure parser for `.solutions/*.meta.json`.
//
// A meta file stores only point/tests/hints (no grading/rating fields) and is
// the source of truth a learning point's identity is derived from. parseMeta
// never throws on malformed input; it reports "not a valid meta" as null.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseMeta } from '../lib/parse-meta.js'

test('parses a valid meta into all required fields', () => {
  const text = JSON.stringify({
    point: 'quat2rotmat',
    module: 'src.utils',
    solution: '.solutions/src_utils_quat2rotmat.py',
    tests: ['test_identity', 'test_normalized'],
    hints: ['归一化四元数', '注意符号'],
  })
  const meta = parseMeta(text)
  assert.ok(meta, 'valid meta must parse to an object')
  assert.equal(meta.point, 'quat2rotmat')
  assert.equal(meta.module, 'src.utils')
  assert.equal(meta.solution, '.solutions/src_utils_quat2rotmat.py')
  assert.deepEqual(meta.tests, ['test_identity', 'test_normalized'])
  assert.deepEqual(meta.hints, ['归一化四元数', '注意符号'])
})

test('returns null when point is missing', () => {
  const text = JSON.stringify({
    module: 'src.utils',
    solution: '.solutions/src_utils_quat2rotmat.py',
    tests: ['test_identity'],
  })
  assert.equal(parseMeta(text), null)
})

test('normalizes a missing tests field to []', () => {
  const text = JSON.stringify({
    point: 'quat2rotmat',
    module: 'src.utils',
    solution: '.solutions/src_utils_quat2rotmat.py',
  })
  const meta = parseMeta(text)
  assert.ok(meta)
  assert.deepEqual(meta.tests, [])
  assert.deepEqual(meta.hints, [])
})

test('normalizes a missing hints field to []', () => {
  const text = JSON.stringify({
    point: 'quat2rotmat',
    module: 'src.utils',
    solution: '.solutions/src_utils_quat2rotmat.py',
    tests: ['test_identity'],
  })
  const meta = parseMeta(text)
  assert.ok(meta)
  assert.deepEqual(meta.hints, [])
})

test('returns null for non-JSON input', () => {
  assert.equal(parseMeta('this is not json {'), null)
  assert.equal(parseMeta(''), null)
  assert.equal(parseMeta('null'), null)
})

test('returns null when tests or hints are not arrays', () => {
  const badTests = JSON.stringify({
    point: 'quat2rotmat',
    module: 'src.utils',
    solution: '.solutions/src_utils_quat2rotmat.py',
    tests: 'test_identity',
  })
  assert.equal(parseMeta(badTests), null)

  const badHints = JSON.stringify({
    point: 'quat2rotmat',
    module: 'src.utils',
    solution: '.solutions/src_utils_quat2rotmat.py',
    tests: [],
    hints: '归一化',
  })
  assert.equal(parseMeta(badHints), null)
})
