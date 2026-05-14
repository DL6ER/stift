import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hashAuthToken, verifyAuthToken, isHashedAuthToken } from '../lib/auth-token.js'

test('hashAuthToken: deterministic, prefixed, distinguishable from plaintext', () => {
  const h1 = hashAuthToken('abcd1234')
  const h2 = hashAuthToken('abcd1234')
  assert.equal(h1, h2)
  assert.ok(h1.startsWith('h$'))
  assert.ok(isHashedAuthToken(h1))
  assert.ok(!isHashedAuthToken('abcd1234'))
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

test('verifyAuthToken: rejects non-strings without throwing', () => {
  assert.ok(!verifyAuthToken(null, 'x'))
  assert.ok(!verifyAuthToken('x', null))
  assert.ok(!verifyAuthToken(undefined, undefined))
})

test('hashAuthToken: rejects empty input', () => {
  assert.throws(() => hashAuthToken(''))
  assert.throws(() => hashAuthToken(null))
})
