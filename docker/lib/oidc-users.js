// OIDC user schema initialisation and find-or-create (UPSERT) logic.
// Extracted from server.js so these functions can be unit-tested in isolation.
import { randomBytes, createHash } from 'crypto'
import { hashAuthToken } from './auth-token.js'

// Prepared statements are cached per Database instance so each call to
// findOrCreateUser doesn't rebuild them. better-sqlite3 has its own internal
// statement cache, but routing every call through that map and through the
// V8 string-interning path on the SQL source is still cheaper to skip. A
// WeakMap lets in-memory test databases get garbage-collected normally.
const _stmtCache = new WeakMap()
function stmts(db) {
  let s = _stmtCache.get(db)
  if (!s) {
    s = {
      byOidcSub:  db.prepare('SELECT * FROM users WHERE external_oidc_sub = ?'),
      byEmail:    db.prepare('SELECT * FROM users WHERE email = ? LIMIT 1'),
      byName:     db.prepare('SELECT * FROM users WHERE username = ?'),
      setSub:     db.prepare('UPDATE users SET external_oidc_sub = ?, email = ? WHERE username = ?'),
      setEmail:   db.prepare('UPDATE users SET email = ? WHERE username = ?'),
      insertUser: db.prepare(
        'INSERT INTO users (username, auth_token, role, max_projects, can_share_projects, created_at, external_oidc_sub, email)'
        + ' VALUES (?, ?, \'user\', ?, 1, ?, ?, ?)'
        + ' ON CONFLICT(external_oidc_sub) DO UPDATE SET email = excluded.email'
      ),
    }
    _stmtCache.set(db, s)
  }
  return s
}

// initUserSchema sets up the users table and the OIDC-related columns/index.
// Safe to call multiple times (all DDL is idempotent).
export function initUserSchema(db) {
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      username           TEXT PRIMARY KEY,
      auth_token         TEXT NOT NULL,
      role               TEXT NOT NULL DEFAULT 'user',
      max_projects       INTEGER NOT NULL,
      can_share_projects INTEGER NOT NULL DEFAULT 1,
      created_at         TEXT NOT NULL
    );
  `)

  const cols = new Set(db.prepare('PRAGMA table_info(users)').all().map(r => r.name))
  if (!cols.has('external_oidc_sub')) {
    db.exec('ALTER TABLE users ADD COLUMN external_oidc_sub TEXT')
  }
  if (!cols.has('email')) {
    db.exec('ALTER TABLE users ADD COLUMN email TEXT')
  }
  // OIDC users have no password, so the SPA cannot derive its E2E
  // encryption key the regular way. Instead the user picks a separate
  // encryption passphrase the first time they sign in. Verification
  // ciphertext (a known plaintext encrypted with that passphrase-derived
  // key) is stored here so the SPA can validate the passphrase on later
  // sign-ins without the server ever seeing the plaintext.
  if (!cols.has('encryption_verification')) {
    db.exec("ALTER TABLE users ADD COLUMN encryption_verification TEXT")
  }

  // A non-partial unique index is required for the ON CONFLICT(external_oidc_sub)
  // UPSERT clause to work. SQLite treats NULL values as distinct, so multiple
  // rows with external_oidc_sub = NULL are still allowed.
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oidc_sub ON users(external_oidc_sub)'
  )
}

// findOrCreateUser looks up a user by externalId (OIDC subject claim).
// When no matching row exists it provisions a new account derived from the
// subject hash and returns { user, created: true }.
// On a concurrent call for the same externalId the UPSERT ON CONFLICT
// clause wins and the function returns { user, created: false }.
//
// Parameters:
//   db           -- better-sqlite3 Database instance
//   externalId   -- OIDC subject claim (string, required)
//   email        -- email from OIDC claims (string or null)
//   username     -- optional preferred username hint; falls back to sso-<hash>
//   maxProjects  -- default project quota for new accounts (default 50)
export function findOrCreateUser(db, { externalId, email = null, username = null, maxProjects = 50 }) {
  const s = stmts(db)

  // Fast path: existing user with this OIDC subject.
  let row = s.byOidcSub.get(externalId)
  if (row) {
    // Keep email in sync if it changed.
    if (email && row.email !== email) {
      s.setEmail.run(email, row.username)
      row = s.byOidcSub.get(externalId)
    }
    return { user: row, created: false }
  }

  // Secondary lookup: link an existing local account to this OIDC identity
  // by email -- but only when the local row has no external_oidc_sub yet.
  // Without that guard a second IdP (or a malicious one) could rebind a
  // user's row to its own sub by asserting the victim's email, effectively
  // hijacking the account on every subsequent callback. Linking is meant
  // for upgrading a password-flow account to OIDC; it is not a mechanism
  // for switching the OIDC binding silently.
  if (email) {
    const existing = s.byEmail.get(email)
    if (existing && !existing.external_oidc_sub) {
      s.setSub.run(externalId, email, existing.username)
      return { user: s.byName.get(existing.username), created: false }
    }
  }

  // Derive a stable, collision-resistant username from the subject hash.
  const base = createHash('sha256').update(externalId).digest('hex').slice(0, 12)
  let candidate = username || `sso-${base}`
  let suffix = 0
  while (s.byName.get(candidate)) {
    suffix++
    candidate = `sso-${base}-${suffix}`
  }

  const authToken = randomBytes(32).toString('hex')
  const now = new Date().toISOString()

  // UPSERT: race-safe for concurrent first-login callbacks with the same sub.
  // ON CONFLICT updates email only, leaving all other columns unchanged, so
  // exactly one row is ever created per externalId.
  // The auth_token column stores the hashed value so a DB leak doesn't
  // hand out usable bearer tokens. The plaintext is never persisted.
  s.insertUser.run(candidate, hashAuthToken(authToken), maxProjects, now, externalId, email)

  const inserted = s.byOidcSub.get(externalId)
  const created = inserted.username === candidate
  return { user: inserted, created }
}
