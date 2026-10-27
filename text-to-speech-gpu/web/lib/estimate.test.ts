import assert from 'node:assert/strict'
import { test } from 'node:test'

import { countWords, estimate, formatDollars, formatDuration } from './estimate.ts'

test('an empty text costs nothing', () => {
  assert.deepEqual(estimate('   '), { words: 0, speechSeconds: 0, billedMinutes: 0, dollars: 0 })
})

test('a short text is one billed minute: five cents', () => {
  const e = estimate('The quick brown fox jumps over the lazy dog.')
  assert.equal(e.words, 9)
  assert.equal(e.billedMinutes, 1)
  assert.equal(formatDollars(e.dollars), '$0.05')
})

test('the longest text the app takes, about 1,000 words, is still one minute', () => {
  const e = estimate('word '.repeat(1000))
  assert.equal(e.speechSeconds, 400)
  assert.equal(e.billedMinutes, 1)
  assert.equal(formatDollars(e.dollars), '$0.05')
})

test('past the overhead, each further minute is five cents more', () => {
  const e = estimate('word '.repeat(2000))
  assert.equal(e.billedMinutes, 2)
  assert.equal(formatDollars(e.dollars), '$0.10')
})

test('words are runs of non-space', () => {
  assert.equal(countWords(' one\ttwo\n\nthree  '), 3)
})

test('durations read the way a person says them', () => {
  assert.equal(formatDuration(0), '0 s')
  assert.equal(formatDuration(45), '45 s')
  assert.equal(formatDuration(60), '1 min')
  assert.equal(formatDuration(125), '2 min 05 s')
})
