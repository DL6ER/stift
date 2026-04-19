// OIDC user schema initialisation and find-or-create (UPSERT) logic.
// Extracted from server.js so these functions can be unit-tested in isolation.
import { randomBytes, createHash } from 'crypto'

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

  // A non-partial unique index is required for the ON CONFLICT(external_oidc_sub)
  // UPSERT clause to work. SQLite treats NULL values as distinct, so multiple
  // rows with external_oidc_sub = NULL are still allowed.
  // Drop the old partial index if it exists, then create the non-partial one.
  db.exec(`
    DROP INDEX IF EXISTS idx_users_oidc_sub;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oidc_sub
      ON users(external_oidc_sub);
  `)
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
  const stmtByOidcSub = db.prepare('SELECT * FROM users WHERE external_oidc_sub = ?')
  const stmtByEmail   = db.prepare('SELECT * FROM users WHERE email = ? LIMIT 1')
  const stmtByName    = db.prepare('SELECT * FROM users WHERE username = ?')
  const stmtSetSub    = db.prepare('UPDATE users SET external_oidc_sub = ?, email = ? WHERE username = ?')

  // Fast path: existing user with this OIDC subject.
  let row = stmtByOidcSub.get(externalId)
  if (row) {
    // Keep email in sync if it changed.
    if (email && row.email !== email) {
      db.prepare('UPDATE users SET email = ? WHERE username = ?').run(email, row.username)
      row = stmtByOidcSub.get(externalId)
    }
    return { user: row, created: false }
  }

  // Secondary lookup: link existing account by email.
  if (email) {
    const existing = stmtByEmail.get(email)
    if (existing) {
      stmtSetSub.run(externalId, email, existing.username)
      return { user: stmtByName.get(existing.username), created: false }
    }
  }

  // Derive a stable, collision-resistant username from the subject hash.
  const base = createHash('sha256').update(externalId).digest('hex').slice(0, 12)
  let candidate = username || `sso-${base}`
  let suffix = 0
  while (stmtByName.get(candidate)) {
    suffix++
    candidate = `sso-${base}-${suffix}`
  }

  const authToken = randomBytes(32).toString('hex')
  const now = new Date().toISOString()

  // UPSERT: race-safe for concurrent first-login callbacks with the same sub.
  // ON CONFLICT updates email only, leaving all other columns unchanged, so
  // exactly one row is ever created per externalId.
  db.prepare(`
    INSERT INTO users
      (username, auth_token, role, max_projects, can_share_projects, created_at, external_oidc_sub, email)
    VALUES (?, ?, 'user', ?, 1, ?, ?, ?)
    ON CONFLICT(external_oidc_sub) DO UPDATE SET email = excluded.email
  `).run(candidate, authToken, maxProjects, now, externalId, email)

  const inserted = stmtByOidcSub.get(externalId)
  const created = inserted.username === candidate
  return { user: inserted, created }
}
