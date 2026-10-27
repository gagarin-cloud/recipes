import assert from 'node:assert/strict'
import { test } from 'node:test'

import { describe, newestFirst, titleOf, WAITING_FOR_GPU, type Manifest } from './status.ts'

const t0 = Date.parse('2026-10-27T10:00:00Z')
const manifest: Manifest = {
  id: 'mh8x2k1a-ab12',
  text: 'Hello there.\nSecond line.',
  voice: 'af_heart',
  created_at: new Date(t0).toISOString(),
  job: 'tts-mh8x2k1a-ab12',
  revision: 1,
}
const at = (s: number) => t0 + s * 1000
const iso = (s: number) => new Date(at(s)).toISOString()

test('audio in the bucket is done, whatever the platform says', () => {
  const d = describe({ manifest, audio: { at: iso(90), bytes: 1000 }, run: null, now: at(4000) })
  assert.equal(d.generation.status, 'done')
  assert.equal(d.generation.elapsed, 90)
  assert.equal(d.record, undefined)
})

test('a run waiting for its machine is pending, and says nothing is billed', () => {
  const d = describe({ manifest, run: { revision: 1, phase: 'pending' }, now: at(30) })
  assert.equal(d.generation.status, 'pending')
  assert.equal(d.generation.detail, WAITING_FOR_GPU)
})

test('past six minutes it is still pending, not failed', () => {
  const d = describe({ manifest, run: { revision: 1, phase: 'pending' }, now: at(7 * 60) })
  assert.equal(d.generation.status, 'pending')
  assert.match(d.generation.detail, /not stuck/)
})

test('a running run is running', () => {
  const d = describe({ manifest, run: { revision: 1, phase: 'running', started_at: iso(200) }, now: at(230) })
  assert.equal(d.generation.status, 'running')
  assert.equal(d.generation.elapsed, 230)
})

test('a failed run is failed and asks to be recorded in the bucket', () => {
  const d = describe({ manifest, run: { revision: 1, phase: 'failed', exit_code: 1, finished_at: iso(300) }, now: at(310) })
  assert.equal(d.generation.status, 'failed')
  assert.match(d.generation.detail, /exit code 1/)
  assert.equal(d.generation.elapsed, 300)
  assert.ok(d.record)
})

test('a recorded failure is read from the bucket, logs and all', () => {
  const d = describe({ manifest, error: { message: 'boom', logs: 'tts: failed: boom\n', at: iso(100) }, now: at(9000) })
  assert.equal(d.generation.status, 'failed')
  assert.equal(d.generation.logs, 'tts: failed: boom\n')
  assert.equal(d.record, undefined)
})

test('a done run with no audio is a failure', () => {
  const d = describe({ manifest, run: { revision: 1, phase: 'done', exit_code: 0 }, now: at(100) })
  assert.equal(d.generation.status, 'failed')
})

test('a job not listed yet is pending for a grace period, then failed', () => {
  assert.equal(describe({ manifest, run: null, now: at(20) }).generation.status, 'pending')
  const late = describe({ manifest, run: null, now: at(600) })
  assert.equal(late.generation.status, 'failed')
  assert.ok(late.record)
})

test('without a token the state is unknown, shown as pending with the reason', () => {
  const d = describe({ manifest, unknown: 'No token here.', now: at(20) })
  assert.equal(d.generation.status, 'pending')
  assert.equal(d.generation.detail, 'No token here.')
})

test('a run replaced by a newer one is failed', () => {
  assert.equal(describe({ manifest, run: { revision: 2, phase: 'running' }, now: at(20) }).generation.status, 'failed')
})

test('titles are the first line, shortened', () => {
  assert.equal(titleOf('  First line\nsecond'), 'First line')
  assert.equal(titleOf('x'.repeat(200), 10), 'xxxxxxxxx…')
})

test('newest first', () => {
  const ids = [{ id: 'aaaaaaaa-0000' }, { id: 'aaaaaaab-0000' }].sort(newestFirst)
  assert.equal(ids[0].id, 'aaaaaaab-0000')
})
