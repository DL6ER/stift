import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { hashAuthToken, verifyAuthToken, isHashedAuthToken, isCurrentHashedAuthToken } from '../lib/auth-token.js'

test('hashAuthToken: deterministic, versioned, distinguishable from plaintext', () => {
  const h1 = hashAuthToken('abcd1234')
  const h2 = hashAuthToken('abcd1234')
  assert.equal(h1, h2)
  assert.ok(h1.startsWith('h1$'))
  assert.ok(isHashedAuthToken(h1))
  assert.ok(isCurrentHashedAuthToken(h1))
  assert.ok(!isHashedAuthToken('abcd1234'))
})

test('isHashedAuthToken: accepts legacy h$ as well, isCurrentHashedAuthToken does not', () => {
  // Manually construct a legacy-format value to simulate a row written
  // before the version prefix landed.
  const legacy = 'h$' + Buffer.from('test').toString('base64')
  assert.ok(isHashedAuthToken(legacy))
  assert.ok(!isCurrentHashedAuthToken(legacy))
})

test('verifyAuthToken: accepts correct plaintext, rejects wrong plaintext', () => {
  const stored = hashAuthToken('correct horse')
  assert.ok(verifyAuthToken(stored, 'correct horse'))
  assert.ok(!verifyAuthToken(stored, 'wrong horse'))
})

test('verifyAuthToken: backwards-compatible with legacy plaintext rows', () => {
  // Pre-hash deployments stored the plaintext directly. The next login on
  // such a row must still succeed so the lazy-upgrade path can run.
  assert.ok(verifyAuthToken('legacy-plain-token', 'legacy-plain-token'))
  assert.ok(!verifyAuthToken('legacy-plain-token', 'something-else'))
})

test('verifyAuthToken: accepts unversioned legacy h$ hashes', () => {
  // A row written under the old unversioned scheme: same SHA-256 of the
  // plaintext, prefixed with just "h$". verifyAuthToken must still
  // recognise and validate it so deployments mid-migration keep working.
  const plain = 'plaintext-from-old-deployment'
  const legacy = 'h$' + createHash('sha256').update(plain).digest('base64')
  assert.ok(verifyAuthToken(legacy, plain))
  assert.ok(!verifyAuthToken(legacy, 'wrong'))
})

test('verifyAuthToken: rejects non-strings without throwing', () => {
  assert.ok(!verifyAuthToken(null, 'x'))
  assert.ok(!verifyAuthToken('x', null))
  assert.ok(!verifyAuthToken(undefined, undefined))
})

test('hashAuthToken: rejects empty input', () => {
  assert.throws(() => hashAuthToken(''))
  assert.throws(() => hashAuthToken(null))
})
