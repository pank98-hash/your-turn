// Tests for classify.js — the pure function that turns a point's placeholder
// state plus its test results into a point status (pending / done / in-progress).
//
// Judging is simple: green = pass, red = fail. No writing-quality scoring, no
// stars, no expectedRed/expectedGreen. classifyPoint never throws.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyPoint } from '../lib/classify.js'

const point = (tests) => ({ point: 'quat2rotmat', tests })

test('pending point -> status "pending" regardless of tests', () => {
  const status = classifyPoint(point(['tests.test_mod.TestA.test_one']), [], true)
  assert.equal(status.point, 'quat2rotmat')
  assert.equal(status.status, 'pending')
  assert.deepEqual(status.failedTests, [])
  assert.deepEqual(status.errorTests, [])
  assert.deepEqual(status.unmatched, [])
})

test('all tests pass -> "done"', () => {
  const results = [
    { id: 'tests.test_mod.TestA.test_one', status: 'pass', detail: '' },
    { id: 'tests.test_mod.TestA.test_two', status: 'pass', detail: '' },
  ]
  const status = classifyPoint(
    point(['tests.test_mod.TestA.test_one', 'tests.test_mod.TestA.test_two']),
    results,
    false,
  )
  assert.equal(status.status, 'done')
  assert.deepEqual(status.failedTests, [])
  assert.deepEqual(status.errorTests, [])
  assert.deepEqual(status.unmatched, [])
})

test('a failing test -> "in-progress" and the id lands in failedTests', () => {
  const results = [
    { id: 'tests.test_mod.TestA.test_one', status: 'pass', detail: '' },
    { id: 'tests.test_mod.TestA.test_two', status: 'fail', detail: 'AssertionError' },
  ]
  const status = classifyPoint(
    point(['tests.test_mod.TestA.test_one', 'tests.test_mod.TestA.test_two']),
    results,
    false,
  )
  assert.equal(status.status, 'in-progress')
  assert.deepEqual(status.failedTests, ['tests.test_mod.TestA.test_two'])
  assert.deepEqual(status.errorTests, [])
  assert.deepEqual(status.unmatched, [])
})

test('an ERROR test is reported separately in errorTests, not failedTests (RF#5)', () => {
  const results = [
    { id: 'tests.test_mod.TestA.test_one', status: 'pass', detail: '' },
    { id: 'tests.test_mod.TestA.test_two', status: 'error', detail: 'NotImplementedError' },
  ]
  const status = classifyPoint(
    point(['tests.test_mod.TestA.test_one', 'tests.test_mod.TestA.test_two']),
    results,
    false,
  )
  assert.equal(status.status, 'in-progress')
  assert.deepEqual(status.failedTests, [])
  assert.deepEqual(status.errorTests, ['tests.test_mod.TestA.test_two'])
  assert.deepEqual(status.unmatched, [])
})

test('a test id matching no result goes to unmatched, never silently ignored (RF#4)', () => {
  const results = [
    { id: 'tests.test_mod.TestA.test_one', status: 'pass', detail: '' },
  ]
  const status = classifyPoint(
    point(['tests.test_mod.TestA.test_one', 'tests.test_mod.TestA.test_typo']),
    results,
    false,
  )
  assert.equal(status.status, 'in-progress')
  assert.deepEqual(status.failedTests, [])
  assert.deepEqual(status.errorTests, [])
  assert.deepEqual(status.unmatched, ['tests.test_mod.TestA.test_typo'])
})

test('empty/missing tests does not crash; point lists normally (RF#2)', () => {
  const status = classifyPoint({ point: 'quat2rotmat', tests: [] }, [], false)
  assert.equal(status.status, 'in-progress')
  assert.deepEqual(status.failedTests, [])
  assert.deepEqual(status.errorTests, [])
  assert.deepEqual(status.unmatched, [])

  // Missing tests field entirely.
  const noTests = classifyPoint({ point: 'quat2rotmat' }, [], false)
  assert.equal(noTests.status, 'in-progress')
  assert.deepEqual(noTests.unmatched, [])
})

test('reads tests from point.meta.tests when point.tests is absent (listPoints shape)', () => {
  const results = [
    { id: 'tests.test_mod.TestA.test_one', status: 'pass', detail: '' },
  ]
  const status = classifyPoint(
    { point: 'quat2rotmat', meta: { tests: ['tests.test_mod.TestA.test_one'] } },
    results,
    false,
  )
  assert.equal(status.status, 'done')
})
