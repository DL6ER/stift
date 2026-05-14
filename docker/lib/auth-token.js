// Hashing helpers for the server-stored auth_token column.
//
// The wire-level token the client sends is high-entropy already (a 256-bit
// PBKDF2 derivative for password users, or a 256-bit random for OIDC users),
// so the column doesn't need a cost-parameterised KDF like Argon2. A single
// SHA-256 is enough to make a DB leak non-trivially usable: the attacker can
// only forge a login if they can also reproduce the PBKDF2 derivation, which
// already costs ~600k SHA-256 ops per password guess.
//
// Stored format: "h$" + base64(sha256(token_plain)). The "h$" prefix lets
// verifyAuthToken distinguish hashed values from legacy plaintext entries
// that pre-date this change, so the server can lazy-upgrade them on the
// next successful login.

import { createHash, timingSafeEqual } from 'crypto'

const PREFIX = 'h$'

export function hashAuthToken(plain) {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new Error('hashAuthToken: plain must be a non-empty string')
  }
  const digest = createHash('sha256').update(plain).digest('base64')
  return `${PREFIX}${digest}`
}

export function isHashedAuthToken(stored) {
  return typeof stored === 'string' && stored.startsWith(PREFIX)
}

// A precomputed hash of a value the caller will never actually send. Used
// by verifyDummyAuthToken to spend the same SHA-256 + timingSafeEqual on
// the "user does not exist" branch as on the "user exists, wrong token"
// branch, so a remote attacker cannot tell the two apart by timing.
const DUMMY_STORED = hashAuthToken('stift-dummy-auth-token-never-issued')

// Run the same compare work as verifyAuthToken but always return false.
// Callers use this when the username lookup miss would otherwise short-
// circuit the verify call and leak existence through a faster response.
export function verifyDummyAuthToken(plain) {
  verifyAuthToken(DUMMY_STORED, typeof plain === 'string' ? plain : '')
  return false
}

// Constant-time verify. Accepts both hashed (h$...) and legacy plaintext
// values so existing DBs keep working until they get rewritten on next login.
export function verifyAuthToken(stored, plain) {
  if (typeof stored !== 'string' || typeof plain !== 'string') return false
  if (isHashedAuthToken(stored)) {
    const candidate = hashAuthToken(plain)
    const a = Buffer.from(stored)
    const b = Buffer.from(candidate)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  }
  // Legacy plaintext compare. Same constant-time treatment.
  const a = Buffer.from(stored)
  const b = Buffer.from(plain)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
