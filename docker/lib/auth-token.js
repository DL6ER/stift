// Hashing helpers for the server-stored auth_token column.
//
// The wire-level token the client sends is high-entropy already (a 256-bit
// PBKDF2 derivative for password users, or a 256-bit random for OIDC users),
// so the column doesn't need a cost-parameterised KDF like Argon2. A single
// SHA-256 is enough to make a DB leak non-trivially usable: the attacker can
// only forge a login if they can also reproduce the PBKDF2 derivation, which
// already costs ~600k SHA-256 ops per password guess.
//
// Stored format: "h1$" + base64(sha256(token_plain)) for new writes. The
// version digit lets a future algorithm change (Argon2, scrypt, ...) ship a
// distinct prefix ("h2$" etc.) without colliding with existing values. Both
// the versioned prefix and the original unversioned "h$" prefix are
// accepted on read so deployments that wrote hashes before this commit
// keep working; the next successful login lazy-upgrades them.

import { createHash, timingSafeEqual } from 'crypto'

const VERSIONED_PREFIX_V1 = 'h1$'
const LEGACY_PREFIX = 'h$'
const HASHED_PREFIX_RE = /^h(?:[1-9][0-9]*)?\$/

export function hashAuthToken(plain) {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new Error('hashAuthToken: plain must be a non-empty string')
  }
  const digest = createHash('sha256').update(plain).digest('base64')
  return `${VERSIONED_PREFIX_V1}${digest}`
}

export function isHashedAuthToken(stored) {
  return typeof stored === 'string' && HASHED_PREFIX_RE.test(stored)
}

// True only when the stored value already uses the current versioned
// prefix. Used by the lazy-upgrade path to migrate both plaintext and
// legacy h$ entries forward.
export function isCurrentHashedAuthToken(stored) {
  return typeof stored === 'string' && stored.startsWith(VERSIONED_PREFIX_V1)
}

// Strip whichever versioned prefix is in front of the digest, so the
// constant-time compare runs on the raw base64. Returns null when the
// input is not a recognised hashed value.
function digestOf(stored) {
  if (typeof stored !== 'string') return null
  if (stored.startsWith(VERSIONED_PREFIX_V1)) return stored.slice(VERSIONED_PREFIX_V1.length)
  if (stored.startsWith(LEGACY_PREFIX)) return stored.slice(LEGACY_PREFIX.length)
  return null
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

// Constant-time verify. Accepts the new versioned hash (h1$...), the
// legacy unversioned hash (h$...) and plaintext entries from pre-hash
// deployments so existing DBs keep working until lazy-upgraded.
export function verifyAuthToken(stored, plain) {
  if (typeof stored !== 'string' || typeof plain !== 'string') return false
  if (isHashedAuthToken(stored)) {
    const candidate = createHash('sha256').update(plain).digest('base64')
    const storedDigest = digestOf(stored)
    if (!storedDigest) return false
    const a = Buffer.from(storedDigest)
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
