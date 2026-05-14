import { createServer } from 'http'
import { readdir, readFile, writeFile, unlink, mkdir, rename } from 'fs/promises'
import { join } from 'path'
import { randomUUID, randomBytes, timingSafeEqual, createHmac } from 'crypto'
import Database from 'better-sqlite3'
import { Issuer, generators } from 'openid-client'
import { initUserSchema, findOrCreateUser } from './lib/oidc-users.js'
import { hashAuthToken, verifyAuthToken, verifyDummyAuthToken, isHashedAuthToken } from './lib/auth-token.js'
import { initOutboxSchema, enqueueWebhook, dueRetries, markDelivered, scheduleRetry, purgeDelivered } from './lib/oidc-outbox.js'

// Server configuration. Adjust as needed for your deployment.
const DATA_DIR = process.env.DATA_DIR || '/data'
const PORT = 3001

// parseEnvInt reads an integer env var with a default and clamps it into the
// allowed range. A non-numeric value (e.g. MAX_PROJECT_SIZE_MB="fifteen")
// falls back to the default with a warning instead of silently yielding NaN
// -- which would make every subsequent comparison false and effectively
// disable the corresponding limit.
function parseEnvInt(name, fallback, { min, max } = {}) {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n)) {
    console.warn(`${name}: not a valid integer (${raw}), using default ${fallback}`)
    return fallback
  }
  let clamped = n
  if (typeof min === 'number' && clamped < min) clamped = min
  if (typeof max === 'number' && clamped > max) clamped = max
  if (clamped !== n) {
    console.warn(`${name}: ${n} clamped to ${clamped} (range ${min ?? '-'}..${max ?? '-'})`)
  }
  return clamped
}

// When true, the server will gzip project data on upload and decompress on
// download. This can save bandwidth and storage at the cost of some (client!)
// CPU time. Adjust based on your typical project sizes and server resources.
const COMPRESS_UPLOADS = (process.env.COMPRESS_UPLOADS || 'true').toLowerCase() !== 'false'
// Reject uploads larger than this size (in megabytes) to prevent abuse and keep
// the server responsive. Adjust as needed based on typical project sizes and
// available resources. Clamped to 1..1024 MB.
const MAX_PROJECT_SIZE_MB = parseEnvInt('MAX_PROJECT_SIZE_MB', 15, { min: 1, max: 1024 })
// Per-user project quota. Set to 0 to disable server storage for everyone (use
// local save instead). Clamped to 0..100000.
const DEFAULT_MAX_PROJECTS_PER_USER = parseEnvInt('MAX_PROJECTS_PER_USER', 50, { min: 0, max: 100000 })
// When false, /api/auth/register is rejected. Existing users can still sign
// in. Set this to false on a public instance that should not accept new
// accounts: if no users exist, server-side storage is effectively disabled
// for everyone. Default true matches the docker-compose defaults and the
// documentation; operators who want a locked-down deployment opt in
// explicitly via ALLOW_REGISTRATION=false.
const ALLOW_REGISTRATION = (process.env.ALLOW_REGISTRATION || 'true').toLowerCase() !== 'false'
// Development mode: verbose request logging on the server, banner in the UI.
// Never enable in production; it makes debugging easier but is noisy.
const DEV_MODE = (process.env.DEV_MODE || '').toLowerCase() === 'true'
// Optional: a JSON array of {label, url} entries to render in the app's footer.
// Self-hosters typically leave this empty. Public instances use it to surface
// Impressum / Datenschutz / Terms links pointing at pages hosted elsewhere.
// Invalid JSON is ignored with a warning so a typo doesn't crash the server.
// URLs are restricted to http(s); `javascript:` and other dangerous schemes
// are dropped.
let FOOTER_LINKS = []
if (process.env.FOOTER_LINKS) {
  try {
    const parsed = JSON.parse(process.env.FOOTER_LINKS)
    if (Array.isArray(parsed)) {
      FOOTER_LINKS = parsed.filter(e =>
        e && typeof e.label === 'string' && typeof e.url === 'string' &&
        /^https?:\/\//i.test(e.url)
      )
      if (FOOTER_LINKS.length !== parsed.length) {
        console.warn(`FOOTER_LINKS: dropped ${parsed.length - FOOTER_LINKS.length} entries (must have label, url, and an http(s):// URL)`)
      }
    }
  } catch (e) {
    console.warn(`FOOTER_LINKS is not valid JSON, ignoring: ${e.message}`)
  }
}
// Optional: when set AND ALLOW_REGISTRATION is false, the auth dialog shows a
// "Become a sponsor" call-to-action linking here instead of the bare
// "Registration is disabled" message. Useful for hosted instances that want
// to point new visitors at an external onboarding / billing page (any URL
// the operator chooses) so they can request an invitation.
// The URL is validated as http(s) for the same reason FOOTER_LINKS is: an
// operator typo (or a copy-pasted javascript:/data: URL) must not turn into
// a rendered href in the SPA. Invalid input is dropped with a warning.
let SPONSOR_URL = process.env.SPONSOR_URL || ''
if (SPONSOR_URL && !/^https?:\/\//i.test(SPONSOR_URL)) {
  console.warn(`SPONSOR_URL ignored (must start with http:// or https://): ${SPONSOR_URL}`)
  SPONSOR_URL = ''
}

// ── Optional OIDC / Single Sign-On ────────────────────────────────────────
//
// Set OIDC_ENABLED=true to activate the SSO flow. When enabled, the auth
// dialog shows a provider-neutral SSO button whose label is controlled by
// OIDC_LOGIN_LABEL (defaults to "Mit Single Sign-On anmelden"). Password-
// based login is hidden when SSO is active.
//
// Required when OIDC_ENABLED=true:
//   OIDC_ISSUER_URL     -- discovery base URL of the identity provider
//   OIDC_CLIENT_ID      -- client ID registered at the identity provider
//   OIDC_CLIENT_SECRET  -- client secret (confidential client flow)
//
// Optional:
//   OIDC_REDIRECT_PATH        -- callback path (default /oidc/callback)
//   OIDC_LOGIN_LABEL          -- button label shown in the auth dialog
//   OIDC_PROVISION_WEBHOOK_URL    -- POST target when a new user is created via SSO
//   OIDC_PROVISION_WEBHOOK_SECRET -- HMAC-SHA256 signing key for the webhook
const OIDC_ENABLED = (process.env.OIDC_ENABLED || '').toLowerCase() === 'true'
const OIDC_ISSUER_URL = process.env.OIDC_ISSUER_URL || ''
const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID || ''
const OIDC_CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET || ''
const OIDC_REDIRECT_PATH = (process.env.OIDC_REDIRECT_PATH || '/oidc/callback').replace(/\/$/, '')
const OIDC_LOGIN_LABEL = process.env.OIDC_LOGIN_LABEL || 'Mit Single Sign-On anmelden'
const OIDC_PROVISION_WEBHOOK_URL = process.env.OIDC_PROVISION_WEBHOOK_URL || ''
const OIDC_PROVISION_WEBHOOK_SECRET = process.env.OIDC_PROVISION_WEBHOOK_SECRET || ''

// Public base URL of the deployment, e.g. "https://stift.example.com". When
// set, the OIDC login + callback handlers derive the redirect_uri from this
// trusted value instead of the per-request Host / X-Forwarded-Host headers.
// Recommended for public deployments: a hostile client cannot then trick
// the server into building an authorize URL or a session cookie under an
// attacker-controlled host even if the proxy forwards a manipulated Host.
const STIFT_PUBLIC_URL = (process.env.STIFT_PUBLIC_URL || '').replace(/\/$/, '')
let _publicProto = null
let _publicHost = null
if (STIFT_PUBLIC_URL) {
  try {
    const u = new URL(STIFT_PUBLIC_URL)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      throw new Error('protocol must be http or https')
    }
    _publicProto = u.protocol.replace(':', '')
    _publicHost = u.host
  } catch (e) {
    console.error(`STIFT_PUBLIC_URL is not a valid http(s) URL: ${e.message}`)
    process.exit(1)
  }
}

if (OIDC_ENABLED) {
  const missing = []
  if (!OIDC_ISSUER_URL) missing.push('OIDC_ISSUER_URL')
  if (!OIDC_CLIENT_ID) missing.push('OIDC_CLIENT_ID')
  if (!OIDC_CLIENT_SECRET) missing.push('OIDC_CLIENT_SECRET')
  if (missing.length > 0) {
    console.error(`OIDC_ENABLED=true but required variable(s) missing: ${missing.join(', ')}`)
    process.exit(1)
  }
}

// A webhook URL without a signing secret would still send "signed" payloads,
// but the HMAC would be computed with an empty key -- predictable for anyone
// who knows the body shape, so the receiver could not actually authenticate
// the sender. Refuse to start in that state instead of pretending integrity.
if (OIDC_PROVISION_WEBHOOK_URL && !OIDC_PROVISION_WEBHOOK_SECRET) {
  console.error('OIDC_PROVISION_WEBHOOK_URL is set but OIDC_PROVISION_WEBHOOK_SECRET is empty')
  process.exit(1)
}

// CORS allowlist. Comma-separated list of allowed origin values for the
// `Access-Control-Allow-Origin` response header on cross-origin XHR /
// fetch requests. The default is empty (same-origin only), which is
// the right answer for the typical Stift deployment where the SPA
// and the API are served from the same nginx vhost. Operators who
// deliberately host the SPA and the API on different origins (or who
// want to embed Stift's API into another application) can set
// CORS_ORIGINS to an explicit allowlist of origins.
//
// "*" is intentionally NOT a magic value here. If an operator wants
// the wide-open behaviour they can set CORS_ORIGINS=* explicitly and
// the next line will pass it through verbatim. Defaulting to "*" was
// the previous behaviour and was flagged in the open-source-readiness
// audit as too loose for a public release.
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

// SQLite.
// Stores user records and per-user quotas. Project blobs themselves stay on
// disk under /data/users/<username>/projects/<id>.json, keeping the database
// small and backups simple.
await mkdir(DATA_DIR, { recursive: true })
const db = new Database(join(DATA_DIR, 'stift.db'))
// auto_vacuum can only be set on an empty database -- it has to land before
// the first CREATE TABLE below. On fresh deployments incremental_vacuum
// then reclaims free pages produced by deletes (consumed invitations,
// purged outbox rows, rotated auth_tokens). Existing DBs need a one-time
// manual VACUUM to convert; the daily incremental_vacuum below becomes a
// no-op on those until the operator runs it.
db.pragma('auto_vacuum = INCREMENTAL')
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
  CREATE TABLE IF NOT EXISTS invitations (
    token              TEXT PRIMARY KEY,
    max_projects       INTEGER NOT NULL,
    can_share_projects INTEGER NOT NULL DEFAULT 1,
    expires_at         TEXT,
    consumed_at        TEXT,
    consumed_by        TEXT,
    created_at         TEXT NOT NULL
  );
`)

// Idempotent OIDC schema additions (columns + unique index on sub).
initUserSchema(db)

// Outbox for OIDC provision webhooks: guarantees at-least-once delivery
// even when the receiver is unreachable on the first attempt.
initOutboxSchema(db)

await migrateLegacyUserFiles()
console.log(`Default max projects per user: ${DEFAULT_MAX_PROJECTS_PER_USER}`)
console.log(`Registration: ${ALLOW_REGISTRATION ? 'open' : 'disabled'}`)
if (DEV_MODE) console.log('*** DEV_MODE enabled: verbose request logging is on ***')

const stmtGetUser = db.prepare('SELECT * FROM users WHERE username = ?')
const stmtInsertUser = db.prepare(
  'INSERT INTO users (username, auth_token, role, max_projects, can_share_projects, created_at) VALUES (?, ?, ?, ?, ?, ?)'
)
const stmtGetInvite = db.prepare('SELECT * FROM invitations WHERE token = ?')
const stmtConsumeInvite = db.prepare(
  'UPDATE invitations SET consumed_at = ?, consumed_by = ? WHERE token = ? AND consumed_at IS NULL'
)

// ── OIDC client (discovered lazily on first use) ──────────────────────────
//
// Cached per `redirectUri` so a stray early call with the wrong scheme
// (e.g. an internal http healthcheck before the reverse proxy injected
// X-Forwarded-Proto) doesn't pin the client to a stale redirect URI for
// the rest of the process lifetime. A hard cap with FIFO eviction keeps
// the map bounded if a misconfigured proxy or hostile direct caller
// varies the Host / X-Forwarded-Host header.
const OIDC_CLIENT_CACHE_LIMIT = 16
let _oidcIssuer = null
const _oidcClients = new Map()
async function getOidcClient(redirectUri) {
  const cached = _oidcClients.get(redirectUri)
  if (cached) return cached
  if (!_oidcIssuer) _oidcIssuer = await Issuer.discover(OIDC_ISSUER_URL)
  const client = new _oidcIssuer.Client({
    client_id: OIDC_CLIENT_ID,
    client_secret: OIDC_CLIENT_SECRET,
    redirect_uris: [redirectUri],
    response_types: ['code'],
  })
  if (_oidcClients.size >= OIDC_CLIENT_CACHE_LIMIT) {
    const oldest = _oidcClients.keys().next().value
    if (oldest !== undefined) _oidcClients.delete(oldest)
  }
  _oidcClients.set(redirectUri, client)
  return client
}

// Signed cookie helpers (no external dep -- manual HMAC-SHA256 signing).
// Cookie format: <base64url(value)>.<base64url(sig)>
const COOKIE_SECRET = process.env.SESSION_SECRET || randomBytes(32).toString('hex')
function signValue(val) {
  const b = Buffer.from(val).toString('base64url')
  const sig = createHmac('sha256', COOKIE_SECRET).update(b).digest('base64url')
  return `${b}.${sig}`
}
function unsignValue(signed) {
  if (typeof signed !== 'string') return null
  const dot = signed.lastIndexOf('.')
  if (dot === -1) return null
  const b = signed.slice(0, dot)
  const sig = signed.slice(dot + 1)
  const expected = createHmac('sha256', COOKIE_SECRET).update(b).digest('base64url')
  const expBuf = Buffer.from(expected)
  const sigBuf = Buffer.from(sig)
  if (expBuf.length !== sigBuf.length) return null
  if (!timingSafeEqual(expBuf, sigBuf)) return null
  return Buffer.from(b, 'base64url').toString()
}

function parseCookies(req) {
  const hdr = req.headers.cookie || ''
  const out = {}
  for (const part of hdr.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k) out[k.trim()] = decodeURIComponent(rest.join('='))
  }
  return out
}

function setCookie(res, name, value, opts = {}) {
  const maxAge = opts.maxAge ?? 600 // 10 min default for OIDC flow cookies
  let h = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`
  if (opts.secure) h += '; Secure'
  const existing = res.getHeader('Set-Cookie')
  const arr = existing ? (Array.isArray(existing) ? existing : [existing]) : []
  arr.push(h)
  res.setHeader('Set-Cookie', arr)
}

function clearCookie(res, name) {
  const arr = (res.getHeader('Set-Cookie') || [])
  const existing = Array.isArray(arr) ? arr : (arr ? [arr] : [])
  existing.push(`${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
  res.setHeader('Set-Cookie', existing)
}

// Simple session store: in-memory map keyed by session id (UUID).
// Each session entry: { username, plainAuthToken, createdAt }. Not
// persisted -- sessions are invalidated on restart. For the OIDC flow
// this is intentional: the operator can add a persistent session store
// later if needed.
const sessions = new Map()
const SESSION_COOKIE = 'stift_sid'
// Operators can shorten or lengthen the OIDC session lifetime via the
// SESSION_MAX_AGE_HOURS env var. Clamped to 1..720h (1h..30d) so a typo
// cannot disable sessions instantly or pin them open for years.
const SESSION_MAX_AGE_HOURS = parseEnvInt('SESSION_MAX_AGE_HOURS', 24, { min: 1, max: 720 })
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_HOURS * 60 * 60 * 1000

// Periodic sweep: getSession deletes expired entries on access, but
// abandoned sessions (browser tab closed, no further requests) would
// otherwise sit in memory until restart. Runs every 10 minutes.
setInterval(() => {
  const now = Date.now()
  for (const [sid, sess] of sessions) {
    if (now - sess.createdAt > SESSION_MAX_AGE_MS) sessions.delete(sid)
  }
}, 10 * 60 * 1000).unref()

function createSession(username, plainAuthToken) {
  const sid = randomUUID()
  sessions.set(sid, { username, plainAuthToken, createdAt: Date.now() })
  return sid
}

// Issue a fresh server-side bearer token for the user, store only its hash,
// and return the plaintext for one-shot delivery to the SPA via the OIDC
// session. Called on every OIDC sign-in (first and returning): a DB leak
// then only exposes hashes, and rotation invalidates the previous token.
function rotateAuthToken(username) {
  const plain = randomBytes(32).toString('hex')
  db.prepare('UPDATE users SET auth_token = ? WHERE username = ?').run(hashAuthToken(plain), username)
  return plain
}

// After a successful password compare, the stored value is still legacy
// plaintext from a pre-hash deployment. Rewrite it as a hash in place so
// the upgrade happens lazily on the user's next login.
function maybeUpgradeStoredAuthToken(username, stored, plain) {
  if (isHashedAuthToken(stored)) return
  db.prepare('UPDATE users SET auth_token = ? WHERE username = ?').run(hashAuthToken(plain), username)
}
function getSession(req) {
  const cookies = parseCookies(req)
  const raw = cookies[SESSION_COOKIE]
  if (!raw) return null
  const sid = unsignValue(raw)
  if (!sid) return null
  const sess = sessions.get(sid)
  if (!sess) return null
  if (Date.now() - sess.createdAt > SESSION_MAX_AGE_MS) {
    sessions.delete(sid)
    return null
  }
  return { sid, ...sess }
}

// Provision webhook: writes the entry to the outbox first, then immediately
// invokes the retry worker. No event is lost even if the receiver is
// unreachable on the first attempt.
async function fireProvisionWebhook(payload) {
  if (!OIDC_PROVISION_WEBHOOK_URL) return
  const body = JSON.stringify(payload)
  const sig = createHmac('sha256', OIDC_PROVISION_WEBHOOK_SECRET).update(body).digest('hex')
  enqueueWebhook(db, body, sig)
  // Fire once immediately without blocking the response.
  retryOidcWebhookOutbox().catch(() => {})
}

// Retry worker: processes all due outbox entries.
// Exponential backoff: min(2^attempts * 30, 3600) seconds.
// After 10 attempts the entry is considered permanently failed
// (attempts >= 10, delivered_at stays NULL) and is not retried again.
//
// Each fetch is bounded by WEBHOOK_FETCH_TIMEOUT_MS so a slow or hostile
// receiver cannot stall the loop indefinitely. _outboxWorkerRunning acts
// as a mutex against the 60-second setInterval starting a second worker
// on top of a still-running one -- without it both would call dueRetries,
// see the same not-yet-delivered rows, and POST duplicate webhooks.
const WEBHOOK_FETCH_TIMEOUT_MS = 30_000
let _outboxWorkerRunning = false
async function retryOidcWebhookOutbox() {
  if (!OIDC_PROVISION_WEBHOOK_URL) return
  if (_outboxWorkerRunning) return
  _outboxWorkerRunning = true
  try {
    const now = Math.floor(Date.now() / 1000)
    const rows = dueRetries(db, now)
    for (const row of rows) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), WEBHOOK_FETCH_TIMEOUT_MS)
      try {
        const resp = await fetch(OIDC_PROVISION_WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-stift-oss-signature': `sha256=${row.signature}`,
          },
          body: row.payload,
          signal: controller.signal,
        })
        if (resp.ok) {
          markDelivered(db, row.id)
        } else {
          throw new Error(`HTTP ${resp.status}`)
        }
      } catch (e) {
        const attempts = row.attempts + 1
        scheduleRetry(db, row.id, attempts, now)
        const backoff = Math.min(Math.pow(2, attempts) * 30, 3600)
        const reason = e.name === 'AbortError' ? `timeout after ${WEBHOOK_FETCH_TIMEOUT_MS}ms` : e.message
        if (attempts >= 10) {
          console.error(`[oidc] provision webhook permanently failed after ${attempts} attempts (outbox id=${row.id}):`, reason)
        } else {
          console.warn(`[oidc] provision webhook attempt ${attempts} failed, next in ${backoff}s (outbox id=${row.id}):`, reason)
        }
      } finally {
        clearTimeout(timer)
      }
    }
  } finally {
    _outboxWorkerRunning = false
  }
}

// Background worker: retry due outbox entries every 60 seconds.
setInterval(() => { retryOidcWebhookOutbox().catch(() => {}) }, 60_000)

// Daily purge of delivered outbox rows older than the retention window so
// the table does not accumulate forever on a long-running deployment.
setInterval(() => {
  try { purgeDelivered(db) } catch (e) { console.warn('[oidc] outbox purge failed:', e.message) }
}, 24 * 60 * 60 * 1000).unref()

// Daily purge of consumed invitations older than 90 days. Matches the
// outbox-purge cadence and keeps the invitations table from accumulating
// records that have no further use after the first consumption.
const INVITATION_RETENTION_MS = 90 * 24 * 60 * 60 * 1000
setInterval(() => {
  try {
    const cutoff = new Date(Date.now() - INVITATION_RETENTION_MS).toISOString()
    const n = db.prepare('DELETE FROM invitations WHERE consumed_at IS NOT NULL AND consumed_at < ?').run(cutoff).changes
    if (n > 0) console.log(`[db] purged ${n} consumed invitation(s) older than 90 days`)
  } catch (e) {
    console.warn('[db] invitations purge failed:', e.message)
  }
}, 24 * 60 * 60 * 1000).unref()

// Daily incremental vacuum reclaims free pages produced by deletes (consumed
// invitations, purged outbox rows, rotated auth_tokens). The PRAGMA only
// has work when auto_vacuum=INCREMENTAL is active on the database -- fresh
// DBs see this from creation, legacy DBs become eligible after a one-time
// manual VACUUM.
setInterval(() => {
  try { db.prepare('PRAGMA incremental_vacuum').run() } catch (e) { console.warn('[db] incremental_vacuum failed:', e.message) }
}, 24 * 60 * 60 * 1000).unref()

// Atomic invite consumption: validate, create user, mark invite consumed.
// Throws an Error with .code on any failure so the route can map to HTTP.
const consumeInviteTxn = db.transaction((token, username, authToken) => {
  const inv = stmtGetInvite.get(token)
  if (!inv) { const e = new Error('invalid_invite'); e.code = 'invalid_invite'; throw e }
  if (inv.consumed_at) { const e = new Error('invite_already_used'); e.code = 'invite_already_used'; throw e }
  if (inv.expires_at && new Date(inv.expires_at) < new Date()) {
    const e = new Error('invite_expired'); e.code = 'invite_expired'; throw e
  }
  if (stmtGetUser.get(username)) {
    const e = new Error('user_exists'); e.code = 'user_exists'; throw e
  }
  const now = new Date().toISOString()
  stmtInsertUser.run(username, hashAuthToken(authToken), 'user', inv.max_projects, inv.can_share_projects, now)
  const result = stmtConsumeInvite.run(now, username, token)
  if (result.changes !== 1) {
    // Race: another consumer beat us between get and update.
    const e = new Error('invite_already_used'); e.code = 'invite_already_used'; throw e
  }
})

function rowToUser(row) {
  if (!row) return null
  return {
    username: row.username,
    authToken: row.auth_token,
    role: row.role,
    maxProjects: row.max_projects,
    canShareProjects: !!row.can_share_projects,
    createdAt: row.created_at,
    externalOidcSub: row.external_oidc_sub ?? null,
    email: row.email ?? null,
  }
}

function getUser(username) {
  const u = sanitizeUsername(username)
  if (!u) return null
  return rowToUser(stmtGetUser.get(u))
}

// One-shot import: pre-SQLite deployments stored each user as a JSON file under
// /data/users/<name>.json. Read those, insert into the DB, then rename to
// *.migrated so we don't import twice (and so the operator can verify before
// deleting them).
async function migrateLegacyUserFiles() {
  const usersDir = join(DATA_DIR, 'users')
  let files
  try { files = await readdir(usersDir) } catch { return }
  let imported = 0
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    const fullPath = join(usersDir, f)
    try {
      const u = JSON.parse(await readFile(fullPath, 'utf-8'))
      if (!u.username || !u.authToken) continue
      const safeName = sanitizeUsername(u.username)
      if (!safeName) { console.warn(`Migration: skipping invalid legacy username in ${f}`); continue }
      // Pre-SQLite JSON files held the authToken in plaintext. Persist it
      // as a hash here so the migrated rows have the same protections as
      // newly-registered ones.
      stmtInsertUser.run(
        safeName,
        hashAuthToken(u.authToken),
        u.role || 'user',
        u.maxProjects ?? DEFAULT_MAX_PROJECTS_PER_USER,
        1,
        u.createdAt || new Date().toISOString(),
      )
      await rename(fullPath, fullPath + '.migrated')
      imported++
    } catch (e) {
      if (!String(e.message).includes('UNIQUE')) console.error(`Migration failed for ${f}:`, e.message)
    }
  }
  if (imported > 0) console.log(`Migrated ${imported} legacy user file(s) into SQLite.`)
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

// Atomic file replace. Plain writeFile open()s O_TRUNC and then streams
// content into the live target, so a SIGKILL mid-write (OOM, docker kill,
// host crash) leaves a half-written or empty file behind. By writing to
// a sibling .tmp and then renaming, the target either stays at its
// previous good state or is fully replaced; the rename is atomic on the
// same POSIX filesystem. randomUUID in the temp name avoids collisions
// when two callers race on the same target.
async function writeFileAtomic(path, content) {
  const tmp = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(tmp, content)
    await rename(tmp, path)
  } catch (e) {
    try { await unlink(tmp) } catch {}
    throw e
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let totalSize = 0
    const maxBytes = MAX_PROJECT_SIZE_MB * 1024 * 1024
    req.on('data', (c) => {
      totalSize += c.length
      if (totalSize > maxBytes) { req.destroy(); reject(new Error(`Payload too large (max ${MAX_PROJECT_SIZE_MB} MB)`)); return }
      chunks.push(c)
    })
    req.on('end', () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString())
        // Routes destructure the body as if it were an object. Without this
        // guard JSON like "null", "42" or "\"x\"" turns into a TypeError on
        // destructuring that surfaces to the client as a 500 -- misleading,
        // since the real problem is a malformed request.
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          const e = new Error('Request body must be a JSON object')
          e.code = 'invalid_body'
          reject(e); return
        }
        resolve(parsed)
      } catch (e) {
        if (!e.code) e.code = 'invalid_body'
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

// Sanitize a username for use as both a SQLite primary key and a filesystem
// path component. Returns null when the input cannot be made safe; callers
// must treat null as "reject this request with 400". The dots-only edge cases
// (`.`, `..`) and inputs with no alphanumerics would otherwise let an attacker
// influence the on-disk layout via path traversal.
function sanitizeUsername(u) {
  if (typeof u !== 'string') return null
  const cleaned = u.toLowerCase().trim().replace(/[^a-z0-9@._-]/gi, '_')
  if (!cleaned || cleaned === '.' || cleaned === '..' || !/[a-z0-9]/.test(cleaned)) return null
  return cleaned
}

// Validate a project / shared-project id. We mint these as `randomUUID()` so
// the only legal shape is a 36-character lowercase UUID. Anything else is
// rejected up-front so a crafted id can never reach the filesystem layer.
// Defense in depth: even though every project route is authenticated and
// scoped to the caller's own directory, validating the id keeps the attack
// surface tiny if the regex match in the route table ever changes.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
function isValidProjectId(id) {
  return typeof id === 'string' && UUID_RE.test(id)
}

// Rate limiting for unauthenticated endpoints.
//
// The auth endpoints (/api/auth/login, /api/auth/register,
// /api/auth/register-with-invite) accept arbitrary client input and are
// the only routes a non-authenticated visitor can hit. Without throttling
// they're a free brute-force surface against the user table. We use a
// minimal in-memory token bucket keyed by client IP: no new dependency,
// no distributed coordination, sufficient for the single-container OSS
// deployment model. Operators who put Stift behind a load balancer with
// its own rate limiting can ignore the warning logs this might emit.
const RATE_LIMIT_MAX = 20         // burst capacity per IP
const RATE_LIMIT_REFILL_MS = 3000 // one token added every 3s (~20/min steady state)
const rateBuckets = new Map()
function clientIp(req) {
  // Behind nginx the request comes from 127.0.0.1 (same container). Trust
  // the proxy headers only when the connection is loopback so a hostile
  // client on the public side can't spoof.
  //
  // Prefer X-Forwarded-For when nginx propagates it -- the leftmost entry
  // is the original client even when this nginx sits behind another
  // reverse proxy like Caddy. X-Real-IP, set by nginx itself, only ever
  // holds the immediate upstream's address (which would be Caddy in the
  // proxied deployment), so it's a fallback for the rare case the chain
  // is misconfigured and X-Forwarded-For is missing entirely.
  const remote = req.socket?.remoteAddress || ''
  if (remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1') {
    const fwd = req.headers['x-forwarded-for']
    if (fwd) {
      const first = String(fwd).split(',')[0].trim()
      if (first) return first
    }
    if (req.headers['x-real-ip']) {
      return String(req.headers['x-real-ip']).split(',')[0].trim()
    }
  }
  return remote || 'unknown'
}
function rateLimit(req) {
  const ip = clientIp(req)
  const now = Date.now()
  let bucket = rateBuckets.get(ip)
  if (!bucket) {
    bucket = { tokens: RATE_LIMIT_MAX, updated: now }
    rateBuckets.set(ip, bucket)
  }
  const elapsed = now - bucket.updated
  bucket.tokens = Math.min(RATE_LIMIT_MAX, bucket.tokens + elapsed / RATE_LIMIT_REFILL_MS)
  bucket.updated = now
  if (bucket.tokens < 1) return false
  bucket.tokens -= 1
  // Opportunistic GC: when the map gets large, drop entries that have
  // recovered to full capacity. Linear in the map size but only runs at
  // a hard cap so memory stays bounded under sustained traffic.
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets) {
      if (now - v.updated > 60000 && v.tokens >= RATE_LIMIT_MAX) rateBuckets.delete(k)
    }
  }
  return true
}

async function authenticate(req) {
  const token = req.headers['x-auth-token']
  const username = req.headers['x-auth-username']
  if (!token || !username) return null
  const user = getUser(username)
  if (!user || !verifyAuthToken(user.authToken, token)) return null
  maybeUpgradeStoredAuthToken(user.username, user.authToken, token)
  return user
}

function userProjectDir(username) {
  const u = sanitizeUsername(username)
  if (!u) throw new Error('invalid_username')
  return join(DATA_DIR, 'users', u, 'projects')
}

async function countUserProjects(username) {
  try { return (await readdir(userProjectDir(username))).filter(f => f.endsWith('.json')).length }
  catch { return 0 }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const path = url.pathname
  const startedAt = DEV_MODE ? Date.now() : 0

  // CORS: only set the response headers for cross-origin requests
  // (those that carry an Origin header) and only echo the Origin back
  // when it's in the configured allowlist. Same-origin requests are
  // unaffected and don't need CORS headers at all.
  //
  // CORS_ORIGINS env var is the allowlist:
  //   unset / empty   -> same-origin only (no CORS headers ever set)
  //   "*"             -> wide open, echo any Origin (legacy behaviour)
  //   "https://a.example,https://b.example" -> exact-match allowlist
  //
  // Vary: Origin is set on every cross-origin response so caches
  // don't reuse a response across different origins.
  const reqOrigin = req.headers.origin
  if (reqOrigin) {
    let allowOrigin = null
    if (CORS_ORIGINS.includes('*')) {
      allowOrigin = reqOrigin  // echo, not literal "*", so credentials would still be possible if we ever added them
    } else if (CORS_ORIGINS.includes(reqOrigin)) {
      allowOrigin = reqOrigin
    }
    if (allowOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowOrigin)
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token, X-Auth-Username')
      res.setHeader('Vary', 'Origin')
    }
  }
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  // Throttle the unauthenticated OIDC entry points too. /oidc/login mints
  // a PKCE verifier + S256 challenge and signs three cookies on every hit;
  // /oidc/callback runs a full openid-client token exchange. Without a
  // bucket, a bot can spam either of these from a single IP and burn
  // CPU + drive load against the IdP.
  if ((path === '/oidc/login' || path === OIDC_REDIRECT_PATH || path === '/api/oidc/logout') && OIDC_ENABLED) {
    if (!rateLimit(req)) return json(res, { error: 'Too many requests, slow down' }, 429)
  }

  if (DEV_MODE) {
    console.log(`[dev] ${req.method} ${path}` + (req.headers['x-auth-username'] ? ` (user=${req.headers['x-auth-username']})` : ''))
    res.on('finish', () => console.log(`[dev]   -> ${res.statusCode} in ${Date.now() - startedAt}ms`))
  }

  try {
    // Public routes.
    if (path === '/api/config' && req.method === 'GET') {
      return json(res, {
        compressUploads: COMPRESS_UPLOADS,
        maxProjectSizeMB: MAX_PROJECT_SIZE_MB,
        registrationEnabled: ALLOW_REGISTRATION,
        devMode: DEV_MODE,
        footerLinks: FOOTER_LINKS,
        sponsorUrl: SPONSOR_URL || null,
        oidcEnabled: OIDC_ENABLED,
        oidcLoginLabel: OIDC_ENABLED ? OIDC_LOGIN_LABEL : null,
      })
    }

    // OIDC / SSO routes. Only active when OIDC_ENABLED=true.
    // /oidc/login  -- redirects the browser to the identity provider
    // /oidc/callback -- receives the authorization code, validates it,
    //                   finds or creates the local user, and redirects
    //                   the browser back to the SPA root (/).
    if (OIDC_ENABLED && path === '/oidc/login' && req.method === 'GET') {
      const proto = _publicProto || req.headers['x-forwarded-proto'] || 'http'
      const host = _publicHost || req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`
      const redirectUri = `${proto}://${host}${OIDC_REDIRECT_PATH}`
      const client = await getOidcClient(redirectUri)
      const state = generators.state()
      const nonce = generators.nonce()
      const codeVerifier = generators.codeVerifier()
      const codeChallenge = generators.codeChallenge(codeVerifier)
      const secure = proto === 'https'
      setCookie(res, 'oidc_state', signValue(state), { maxAge: 600, secure })
      setCookie(res, 'oidc_nonce', signValue(nonce), { maxAge: 600, secure })
      setCookie(res, 'oidc_verifier', signValue(codeVerifier), { maxAge: 600, secure })
      const authUrl = client.authorizationUrl({
        scope: 'openid email profile',
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        redirect_uri: redirectUri,
      })
      res.writeHead(302, { Location: authUrl })
      res.end()
      return
    }

    if (OIDC_ENABLED && path === OIDC_REDIRECT_PATH && req.method === 'GET') {
      const proto = _publicProto || req.headers['x-forwarded-proto'] || 'http'
      const host = _publicHost || req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`
      const redirectUri = `${proto}://${host}${OIDC_REDIRECT_PATH}`
      const client = await getOidcClient(redirectUri)
      const cookies = parseCookies(req)
      const state = unsignValue(cookies['oidc_state'] || '')
      const nonce = unsignValue(cookies['oidc_nonce'] || '')
      const codeVerifier = unsignValue(cookies['oidc_verifier'] || '')
      clearCookie(res, 'oidc_state')
      clearCookie(res, 'oidc_nonce')
      clearCookie(res, 'oidc_verifier')
      if (!state || !nonce || !codeVerifier) {
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end('Ungültige oder abgelaufene Anmelde-Sitzung. Bitte erneut versuchen.')
        return
      }
      let tokenSet
      try {
        const params = client.callbackParams(req.url)
        tokenSet = await client.callback(redirectUri, params, {
          state,
          nonce,
          code_verifier: codeVerifier,
        })
      } catch (e) {
        console.error('[oidc] callback error:', e.message)
        res.writeHead(302, { Location: '/?oidc_error=callback_failed' })
        res.end()
        return
      }
      const claims = tokenSet.claims()
      const sub = claims.sub
      // Only trust the email claim when the IdP marks it as verified. An
      // unverified email must not be used to link to an existing local
      // account (see findOrCreateUser): otherwise a permissive IdP could
      // assert a victim's email and take over their row.
      const rawEmail = (claims.email || '').toLowerCase().trim() || null
      const email = rawEmail && claims.email_verified === true ? rawEmail : null
      if (!sub) {
        res.writeHead(302, { Location: '/?oidc_error=no_sub' })
        res.end()
        return
      }
      // Find or provision the local user account for this OIDC subject.
      const { user: userRow, created: isNew } = findOrCreateUser(db, {
        externalId: sub,
        email,
        maxProjects: DEFAULT_MAX_PROJECTS_PER_USER,
      })
      if (isNew) {
        fireProvisionWebhook({
          sso_user_id: sub,
          stift_user_id: userRow.username,
          email: email || '',
        }).catch(() => {})
      }
      const user = rowToUser(userRow)
      // Issue a fresh server-side bearer token on every OIDC sign-in. The
      // stored column is the hash; the plaintext only lives in the in-memory
      // session and is handed to the bridge for localStorage.
      const plainAuthToken = rotateAuthToken(user.username)
      const sid = createSession(user.username, plainAuthToken)
      const secure = proto === 'https'
      setCookie(res, SESSION_COOKIE, signValue(sid), { maxAge: SESSION_MAX_AGE_MS / 1000, secure })
      // Bridge page instead of a plain 302: the SPA reads username +
      // authToken from localStorage, but the OIDC callback only set an
      // HttpOnly session cookie. The bridge fetches /api/oidc/session
      // using that cookie, writes the values into localStorage, and then
      // navigates to the SPA root. Without this step the SPA never sees
      // the OIDC login and keeps showing the sign-in button.
      // The bridge logic lives in /oidc/bridge.js (served separately) so
      // it loads under a strict script-src 'self' CSP without needing
      // unsafe-inline or a per-request nonce.
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      })
      res.end(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Signing you in&hellip;</title></head>
<body>
<noscript>JavaScript is required to finish signing in. <a href="/">Go to app</a></noscript>
<p>Signing you in&hellip;</p>
<script src="/oidc/bridge.js"></script>
</body>
</html>`)
      return
    }

    if (OIDC_ENABLED && path === '/oidc/bridge.js' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
      })
      res.end(`(async function () {
  try {
    const r = await fetch('/api/oidc/session', { credentials: 'same-origin' });
    if (!r.ok) throw new Error('session lookup failed: ' + r.status);
    const d = await r.json();
    if (!d.authenticated) throw new Error('session not authenticated');
    try {
      localStorage.setItem('stift-auth-username', d.username);
      localStorage.setItem('stift-auth-token', d.authToken);
      localStorage.setItem('stift-auth-source', 'oidc');
    } catch (e) {}
  } catch (e) {
    // fall through to / and let the SPA handle the unauthenticated state
  } finally {
    location.replace('/');
  }
})();
`)
      return
    }

    // Server-side OIDC logout. The SPA's local clear-out is not enough --
    // the in-memory session map still holds the SID's username and the
    // plaintext auth token issued at OIDC callback time. Anyone who later
    // captures the stift_sid cookie from a shared device could otherwise
    // keep retrieving the user's credentials via /api/oidc/session for the
    // full 24h session window. POST-only so a stray cross-origin GET cannot
    // log a user out involuntarily.
    if (OIDC_ENABLED && path === '/api/oidc/logout' && req.method === 'POST') {
      const cookies = parseCookies(req)
      const raw = cookies[SESSION_COOKIE]
      if (raw) {
        const sid = unsignValue(raw)
        if (sid) sessions.delete(sid)
      }
      clearCookie(res, SESSION_COOKIE)
      return json(res, { ok: true })
    }

    // OIDC session check -- lets the SPA know if there is an active SSO session.
    if (OIDC_ENABLED && path === '/api/oidc/session' && req.method === 'GET') {
      const sess = getSession(req)
      if (!sess) return json(res, { authenticated: false })
      const user = getUser(sess.username)
      if (!user) return json(res, { authenticated: false })
      // The plaintext auth_token only exists in the in-memory session map
      // (set by createSession at OIDC callback time). The DB only stores
      // the hash; we never recompute the plaintext from it.
      if (!sess.plainAuthToken) return json(res, { authenticated: false })
      return json(res, {
        authenticated: true,
        username: user.username,
        authToken: sess.plainAuthToken,
        maxProjects: user.maxProjects,
        canShareProjects: user.canShareProjects,
      })
    }

    // E2E encryption verification blob, OIDC-only. The blob is opaque
    // ciphertext produced and consumed entirely client-side; the server
    // just stores and returns it. This lets the SPA tell first-login
    // (no blob -- prompt for a new passphrase, store its verification)
    // from returning sign-in (blob present -- prompt to enter and validate
    // it client-side). Auth comes from the OIDC session cookie, not from
    // the regular X-Auth-Token header, since the SPA has not yet derived
    // its encryption key at this point.
    if (OIDC_ENABLED && path === '/api/oidc/encryption-verification' && req.method === 'GET') {
      const sess = getSession(req)
      if (!sess) return json(res, { error: 'Authentication required' }, 401)
      const row = db.prepare('SELECT encryption_verification FROM users WHERE username = ?').get(sess.username)
      if (!row) return json(res, { error: 'User not found' }, 404)
      return json(res, { verification: row.encryption_verification || null })
    }
    if (OIDC_ENABLED && path === '/api/oidc/encryption-verification' && req.method === 'PUT') {
      const sess = getSession(req)
      if (!sess) return json(res, { error: 'Authentication required' }, 401)
      const body = await parseBody(req)
      const blob = typeof body?.verification === 'string' ? body.verification : null
      if (!blob || blob.length > 4096) {
        return json(res, { error: 'verification must be a non-empty base64 string under 4 KiB' }, 400)
      }
      const existing = db.prepare('SELECT encryption_verification FROM users WHERE username = ?').get(sess.username)
      if (!existing) return json(res, { error: 'User not found' }, 404)
      // Refuse to overwrite an existing verification blob: if the user
      // could swap it out at will, an attacker who hijacks the OIDC
      // session could replace the ciphertext with one they know the
      // plaintext for and then read all server-stored projects after
      // re-encryption. First-write wins; reset is an explicit operator
      // action.
      if (existing.encryption_verification) {
        return json(res, { error: 'verification already set' }, 409)
      }
      db.prepare('UPDATE users SET encryption_verification = ? WHERE username = ?').run(blob, sess.username)
      return json(res, { ok: true })
    }

    // Auth routes.
    // Throttle every unauthenticated /api/auth/* request from a given
    // client IP. Returns 429 when the per-IP token bucket is empty so
    // brute force against the user table is bounded to ~20 attempts per
    // minute steady state.
    if (path.startsWith('/api/auth/') && (req.method === 'POST')) {
      if (!rateLimit(req)) return json(res, { error: 'Too many requests, slow down' }, 429)
    }
    if (path === '/api/auth/register' && req.method === 'POST') {
      if (!ALLOW_REGISTRATION) return json(res, { error: 'Registration is disabled on this instance' }, 403)
      const { username, authToken } = await parseBody(req)
      if (!username || !authToken) return json(res, { error: 'Username and password required' }, 400)
      const uname = sanitizeUsername(username)
      if (!uname) return json(res, { error: 'Invalid username' }, 400)
      if (getUser(uname)) return json(res, { error: 'User already exists' }, 409)
      stmtInsertUser.run(uname, hashAuthToken(authToken), 'user', DEFAULT_MAX_PROJECTS_PER_USER, 1, new Date().toISOString())
      await mkdir(userProjectDir(uname), { recursive: true })
      return json(res, { ok: true }, 201)
    }

    // Consume an invitation: creates a new user account regardless of
    // ALLOW_REGISTRATION. The invite *is* the authorization to create an
    // account; invites are issued out-of-band by whoever manages the instance.
    if (path === '/api/auth/register-with-invite' && req.method === 'POST') {
      const { username, authToken, invite } = await parseBody(req)
      if (!username || !authToken || !invite) {
        return json(res, { error: 'Username, password, and invite are required' }, 400)
      }
      const uname = sanitizeUsername(username)
      if (!uname) return json(res, { error: 'Invalid username' }, 400)
      try {
        consumeInviteTxn(invite, uname, authToken)
      } catch (e) {
        if (e.code === 'invalid_invite') return json(res, { error: 'Invitation not found' }, 404)
        if (e.code === 'invite_already_used') return json(res, { error: 'Invitation has already been used' }, 409)
        if (e.code === 'invite_expired') return json(res, { error: 'Invitation has expired' }, 410)
        if (e.code === 'user_exists') return json(res, { error: 'User already exists' }, 409)
        throw e
      }
      await mkdir(userProjectDir(uname), { recursive: true })
      return json(res, { ok: true }, 201)
    }

    // Apply an invitation to an EXISTING account. Same as register-with-
    // invite but for users who already have a Stift account and just need
    // their quotas upgraded. Requires valid credentials + a valid invite.
    if (path === '/api/auth/apply-invite' && req.method === 'POST') {
      const { username, authToken, invite } = await parseBody(req)
      if (!username || !authToken || !invite) {
        return json(res, { error: 'Username, password, and invite required' }, 400)
      }
      const uname = sanitizeUsername(username)
      if (!uname) return json(res, { error: 'Invalid username' }, 400)
      const user = getUser(uname)
      if (!user) {
        verifyDummyAuthToken(authToken)
        return json(res, { error: 'Invalid username or password' }, 401)
      }
      if (typeof authToken !== 'string' || !verifyAuthToken(user.authToken, authToken)) {
        return json(res, { error: 'Invalid username or password' }, 401)
      }
      maybeUpgradeStoredAuthToken(user.username, user.authToken, authToken)
      const inv = stmtGetInvite.get(invite)
      if (!inv) return json(res, { error: 'Invitation not found' }, 404)
      if (inv.consumed_at) return json(res, { error: 'Invitation has already been used' }, 409)
      if (inv.expires_at && new Date(inv.expires_at) < new Date()) {
        return json(res, { error: 'Invitation has expired' }, 410)
      }
      // Update quotas from the invite
      db.prepare('UPDATE users SET max_projects = ?, can_share_projects = ? WHERE username = ?')
        .run(inv.max_projects, inv.can_share_projects, uname)
      stmtConsumeInvite.run(new Date().toISOString(), uname, invite)
      return json(res, { ok: true, applied: true })
    }

    if (path === '/api/auth/login' && req.method === 'POST') {
      const { username, authToken } = await parseBody(req)
      const user = getUser(username)
      // Use the constant-time helper rather than !==. The auth token is the
      // user's secret credential, and byte-by-byte short-circuit comparison
      // would expose a (small) timing oracle.
      // Spend the same compute on the "no such user" branch so the response
      // timing does not distinguish existing from non-existing accounts.
      if (!user) {
        verifyDummyAuthToken(authToken)
        return json(res, { error: 'Invalid credentials' }, 401)
      }
      if (typeof authToken !== 'string' || !verifyAuthToken(user.authToken, authToken)) {
        return json(res, { error: 'Invalid credentials' }, 401)
      }
      maybeUpgradeStoredAuthToken(user.username, user.authToken, authToken)
      const projectCount = await countUserProjects(username)
      return json(res, { ok: true, role: user.role, projectCount, maxProjects: user.maxProjects, canShareProjects: user.canShareProjects })
    }

    // Projects (auth required).
    if (path === '/api/projects' && req.method === 'GET') {
      const user = await authenticate(req)
      if (!user) return json(res, { error: 'Authentication required' }, 401)
      const dir = userProjectDir(user.username)
      try { await mkdir(dir, { recursive: true }) } catch {}
      const files = await readdir(dir)
      const projects = []
      for (const f of files) {
        if (!f.endsWith('.json')) continue
        try {
          const raw = await readFile(join(dir, f), 'utf-8')
          const data = JSON.parse(raw)
          projects.push({
            id: f.replace('.json', ''), name: data.name || 'Untitled',
            updatedAt: data.updatedAt || new Date().toISOString(),
            imageCount: data.images?.length || data.imageCount || 0,
            annotationCount: data.annotations?.length || data.annotationCount || 0,
            canvasWidth: data.canvasWidth || 0, canvasHeight: data.canvasHeight || 0,
            sizeKB: Math.round(Buffer.byteLength(raw) / 1024), encrypted: !!data.encrypted,
          })
        } catch {}
      }
      projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      return json(res, projects)
    }

    if (path === '/api/projects' && req.method === 'POST') {
      const user = await authenticate(req)
      if (!user) return json(res, { error: 'Authentication required' }, 401)
      const count = await countUserProjects(user.username)
      const limit = user.maxProjects
      if (limit === 0) return json(res, { error: 'Server storage is not enabled for this account. Save locally instead.' }, 403)
      if (count >= limit) return json(res, { error: `Project limit reached (${count}/${limit}).` }, 413)
      const body = await parseBody(req)
      const id = randomUUID()
      body.updatedAt = new Date().toISOString()
      body.owner = user.username
      const dir = userProjectDir(user.username)
      await mkdir(dir, { recursive: true })
      await writeFileAtomic(join(dir, `${id}.json`), JSON.stringify(body))
      return json(res, { id }, 201)
    }

    const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/)
    if (projectMatch) {
      if (!isValidProjectId(projectMatch[1])) return json(res, { error: 'Invalid project id' }, 400)
      if (req.method === 'GET') {
        const user = await authenticate(req)
        if (!user) return json(res, { error: 'Authentication required' }, 401)
        try {
          const data = await readFile(join(userProjectDir(user.username), `${projectMatch[1]}.json`), 'utf-8')
          return json(res, JSON.parse(data))
        } catch (e) {
          if (e.code === 'ENOENT') return json(res, { error: 'Project not found' }, 404)
          throw e
        }
      }
      if (req.method === 'PUT') {
        const user = await authenticate(req)
        if (!user) return json(res, { error: 'Authentication required' }, 401)
        const body = await parseBody(req)
        body.updatedAt = new Date().toISOString()
        body.owner = user.username
        await writeFileAtomic(join(userProjectDir(user.username), `${projectMatch[1]}.json`), JSON.stringify(body))
        return json(res, { ok: true })
      }
      if (req.method === 'DELETE') {
        const user = await authenticate(req)
        if (!user) return json(res, { error: 'Authentication required' }, 401)
        try {
          await unlink(join(userProjectDir(user.username), `${projectMatch[1]}.json`))
        } catch (e) {
          if (e.code === 'ENOENT') return json(res, { error: 'Project not found' }, 404)
          throw e
        }
        return json(res, { ok: true })
      }
    }

    // Shared projects.
    if (path === '/api/shared' && req.method === 'GET') {
      const user = await authenticate(req)
      if (!user) return json(res, { error: 'Authentication required' }, 401)
      const sharedDir = join(DATA_DIR, 'shared')
      try { await mkdir(sharedDir, { recursive: true }) } catch {}
      const files = await readdir(sharedDir)
      const projects = []
      for (const f of files) {
        if (!f.endsWith('.json')) continue
        try {
          const raw = await readFile(join(sharedDir, f), 'utf-8')
          const data = JSON.parse(raw)
          const member = data.members?.find(m => m.username === user.username)
          if (!member) continue
          projects.push({ id: f.replace('.json', ''), name: data.name || 'Shared Project', owner: data.owner, role: member.role, updatedAt: data.updatedAt, memberCount: data.members?.length || 0, sizeKB: Math.round(Buffer.byteLength(raw) / 1024) })
        } catch {}
      }
      projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      // Defensive cap: prevent an instance with thousands of shared projects
      // from returning a multi-megabyte JSON array on every listing call.
      // The newest 500 are still plenty for the UI; older entries can be
      // surfaced via a future search/pagination endpoint.
      const SHARED_LIST_CAP = 500
      const capped = projects.length > SHARED_LIST_CAP ? projects.slice(0, SHARED_LIST_CAP) : projects
      return json(res, capped)
    }
    if (path === '/api/shared' && req.method === 'POST') {
      const user = await authenticate(req)
      if (!user) return json(res, { error: 'Authentication required' }, 401)
      if (!user.canShareProjects) return json(res, { error: 'Shared projects are not enabled for this account.' }, 403)
      const body = await parseBody(req)
      // Validate the optional initial members array: the caller must be in
      // it (otherwise they immediately lose access to their own project),
      // every named user must be an existing account, and every entry must
      // carry a wrappedKey. Without this an attacker could spam fake "shared
      // with you" entries into arbitrary inboxes.
      let members
      if (Array.isArray(body.members)) {
        if (body.members.length === 0) return json(res, { error: 'members must include the caller' }, 400)
        const normalised = []
        for (const m of body.members) {
          const uname = sanitizeUsername(m?.username)
          if (!uname) return json(res, { error: 'invalid member username' }, 400)
          if (typeof m.wrappedKey !== 'string' || !m.wrappedKey) {
            return json(res, { error: 'each member needs a wrappedKey' }, 400)
          }
          if (!getUser(uname)) return json(res, { error: `member not found: ${uname}` }, 400)
          const role = m.role === 'owner' || m.role === 'editor' || m.role === 'viewer' ? m.role : 'editor'
          normalised.push({ username: uname, role, wrappedKey: m.wrappedKey })
        }
        if (!normalised.some(m => m.username === user.username)) {
          return json(res, { error: 'members must include the caller' }, 400)
        }
        members = normalised
      } else {
        if (typeof body.wrappedKey !== 'string' || !body.wrappedKey) {
          return json(res, { error: 'wrappedKey required' }, 400)
        }
        members = [{ username: user.username, role: 'owner', wrappedKey: body.wrappedKey }]
      }
      const id = randomUUID()
      const sharedDir = join(DATA_DIR, 'shared')
      await mkdir(sharedDir, { recursive: true })
      const project = { ...body, owner: user.username, updatedAt: new Date().toISOString(), members }
      await writeFileAtomic(join(sharedDir, `${id}.json`), JSON.stringify(project))
      return json(res, { id }, 201)
    }
    // Helper: read+parse a shared project file by id, returning null if it
    // doesn't exist. Anything else (including parse errors) is rethrown so
    // the global handler logs it.
    const readSharedProject = async (id) => {
      try {
        return JSON.parse(await readFile(join(DATA_DIR, 'shared', `${id}.json`), 'utf-8'))
      } catch (e) {
        if (e.code === 'ENOENT') return null
        throw e
      }
    }

    const sharedMatch = path.match(/^\/api\/shared\/([^/]+)$/)
    if (sharedMatch) {
      if (!isValidProjectId(sharedMatch[1])) return json(res, { error: 'Invalid project id' }, 400)
      if (req.method === 'GET') {
        const user = await authenticate(req)
        if (!user) return json(res, { error: 'Authentication required' }, 401)
        const data = await readSharedProject(sharedMatch[1])
        if (!data) return json(res, { error: 'Shared project not found' }, 404)
        if (!data.members?.find(m => m.username === user.username)) return json(res, { error: 'Access denied' }, 403)
        return json(res, data)
      }
      if (req.method === 'PUT') {
        const user = await authenticate(req)
        if (!user) return json(res, { error: 'Authentication required' }, 401)
        const existing = await readSharedProject(sharedMatch[1])
        if (!existing) return json(res, { error: 'Shared project not found' }, 404)
        const member = existing.members?.find(m => m.username === user.username)
        if (!member || member.role === 'viewer') return json(res, { error: 'Edit access required' }, 403)
        const body = await parseBody(req)
        body.updatedAt = new Date().toISOString(); body.members = existing.members; body.owner = existing.owner
        await writeFileAtomic(join(DATA_DIR, 'shared', `${sharedMatch[1]}.json`), JSON.stringify(body))
        return json(res, { ok: true })
      }
      if (req.method === 'DELETE') {
        const user = await authenticate(req)
        if (!user) return json(res, { error: 'Authentication required' }, 401)
        const data = await readSharedProject(sharedMatch[1])
        if (!data) return json(res, { error: 'Shared project not found' }, 404)
        if (data.owner !== user.username) return json(res, { error: 'Owner access required' }, 403)
        await unlink(join(DATA_DIR, 'shared', `${sharedMatch[1]}.json`))
        return json(res, { ok: true })
      }
    }
    const memberMatch = path.match(/^\/api\/shared\/([^/]+)\/members$/)
    if (memberMatch && req.method === 'POST') {
      if (!isValidProjectId(memberMatch[1])) return json(res, { error: 'Invalid project id' }, 400)
      const user = await authenticate(req)
      if (!user) return json(res, { error: 'Authentication required' }, 401)
      const data = await readSharedProject(memberMatch[1])
      if (!data) return json(res, { error: 'Shared project not found' }, 404)
      const member = data.members?.find(m => m.username === user.username)
      if (!member || (member.role !== 'owner' && member.role !== 'editor')) return json(res, { error: 'Insufficient permissions' }, 403)
      const { username, role, wrappedKey } = await parseBody(req)
      const uname = sanitizeUsername(username)
      if (!uname || typeof wrappedKey !== 'string' || !wrappedKey) {
        return json(res, { error: 'Username and wrappedKey required' }, 400)
      }
      if (!getUser(uname)) return json(res, { error: 'Member account not found' }, 404)
      if (data.members.find(m => m.username === uname)) return json(res, { error: 'Already a member' }, 409)
      // Only owners may grant the owner role. Editors can add editors and
      // viewers; anything else falls back to editor.
      const requested = role === 'owner' || role === 'editor' || role === 'viewer' ? role : 'editor'
      const finalRole = requested === 'owner' && member.role !== 'owner' ? 'editor' : requested
      data.members.push({ username: uname, role: finalRole, wrappedKey, addedBy: user.username, addedAt: new Date().toISOString() })
      await writeFileAtomic(join(DATA_DIR, 'shared', `${memberMatch[1]}.json`), JSON.stringify(data))
      return json(res, { ok: true })
    }
    // Self-update the caller's own wrapped key on a shared project. Used by
    // the SPA right after a freshly invited user opens the project for the
    // first time: the inviter wrapped the Project Key under a derivation of
    // (projectId, inviteeUsername), which is reproducible from public data
    // and therefore only safe for the few seconds between invite and first
    // open. After the invitee has unwrapped with the derived key, they
    // immediately re-wrap with their personal key and PUT it here so the
    // pending-invite window closes. The endpoint only ever touches the
    // caller's own member entry.
    const myWrappedKeyMatch = path.match(/^\/api\/shared\/([^/]+)\/wrapped-key$/)
    if (myWrappedKeyMatch && req.method === 'PUT') {
      if (!isValidProjectId(myWrappedKeyMatch[1])) return json(res, { error: 'Invalid project id' }, 400)
      const user = await authenticate(req)
      if (!user) return json(res, { error: 'Authentication required' }, 401)
      const data = await readSharedProject(myWrappedKeyMatch[1])
      if (!data) return json(res, { error: 'Shared project not found' }, 404)
      const idx = data.members?.findIndex(m => m.username === user.username) ?? -1
      if (idx < 0) return json(res, { error: 'Not a member' }, 403)
      const { wrappedKey } = await parseBody(req)
      if (typeof wrappedKey !== 'string' || !wrappedKey || wrappedKey.length > 4096) {
        return json(res, { error: 'wrappedKey must be a non-empty base64 string under 4 KiB' }, 400)
      }
      data.members[idx] = { ...data.members[idx], wrappedKey }
      await writeFileAtomic(join(DATA_DIR, 'shared', `${myWrappedKeyMatch[1]}.json`), JSON.stringify(data))
      return json(res, { ok: true })
    }

    const rmMemberMatch = path.match(/^\/api\/shared\/([^/]+)\/members\/([^/]+)$/)
    if (rmMemberMatch && req.method === 'DELETE') {
      if (!isValidProjectId(rmMemberMatch[1])) return json(res, { error: 'Invalid project id' }, 400)
      const user = await authenticate(req)
      if (!user) return json(res, { error: 'Authentication required' }, 401)
      const data = await readSharedProject(rmMemberMatch[1])
      if (!data) return json(res, { error: 'Shared project not found' }, 404)
      if (!data.members?.find(m => m.username === user.username && m.role === 'owner')) return json(res, { error: 'Owner access required' }, 403)
      data.members = data.members.filter(m => m.username !== decodeURIComponent(rmMemberMatch[2]))
      await writeFileAtomic(join(DATA_DIR, 'shared', `${rmMemberMatch[1]}.json`), JSON.stringify(data))
      return json(res, { ok: true })
    }

    res.writeHead(404); res.end('Not Found')
  } catch (err) {
    // Always log the full stack server-side so the operator can debug,
    // but never leak internal details to the client. The client gets a
    // bland generic message; the only exception is the well-known
    // "payload too large" branch which surfaces a hint at the limit so
    // honest clients can react.
    if (DEV_MODE) console.error(`[dev]   ! ${req.method} ${path} threw:`, err.stack || err)
    else console.error(err)
    if (err.message?.includes('too large')) {
      res.writeHead(413, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    } else if (err.code === 'invalid_body') {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid request body' }))
    } else {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Internal server error' }))
    }
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Stift API server listening on port ${PORT}${DEV_MODE ? ' (DEV_MODE)' : ''}`)
})

// Graceful shutdown.
//
// Without an explicit handler, Node as PID 1 in a Linux container does
// NOT get default signal actions (the kernel treats PID 1 specially,
// see process(7)). docker stop sends SIGTERM, gets ignored, and falls
// back to SIGKILL after the stop_grace_period. The compose service is
// also configured with `init: true` so an init wrapper handles PID 1
// signal semantics, but we still want our own handler so in-flight
// HTTP requests drain cleanly and the SQLite database is closed via
// its WAL checkpoint instead of being torn down mid-write.
//
// Order:
//   1. Stop accepting new connections (server.close)
//   2. Close the SQLite database (forces WAL checkpoint)
//   3. Exit cleanly
//
// A 5s safety timer force-exits if anything hangs.
let shuttingDown = false
function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[shutdown] received ${signal}, draining...`)
  const forceExit = setTimeout(() => {
    console.error('[shutdown] graceful drain timed out after 5s, force-exiting')
    process.exit(1)
  }, 5000)
  forceExit.unref()
  server.close((err) => {
    if (err) console.error('[shutdown] server.close:', err.message)
    try { db.close() } catch (e) { console.error('[shutdown] db.close:', e.message) }
    console.log('[shutdown] clean exit')
    process.exit(0)
  })
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
