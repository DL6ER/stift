// Provision-webhook outbox: schema, enqueue, retry scheduling, and delivery
// marking. Extracted from server.js so this logic can be unit-tested in
// isolation without starting the HTTP server.

// initOutboxSchema creates the outbox table and its index. Idempotent.
export function initOutboxSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS oidc_webhook_outbox (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      payload         TEXT    NOT NULL,
      signature       TEXT    NOT NULL,
      attempts        INTEGER NOT NULL DEFAULT 0,
      next_attempt_at INTEGER NOT NULL,
      created_at      INTEGER NOT NULL,
      delivered_at    INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_webhook_outbox_pending
      ON oidc_webhook_outbox(next_attempt_at) WHERE delivered_at IS NULL;
  `)
}

// enqueueWebhook inserts a new outbox entry ready for immediate delivery.
// now is a Unix timestamp (seconds); defaults to the current time.
export function enqueueWebhook(db, payload, signature, now = Math.floor(Date.now() / 1000)) {
  db.prepare(
    'INSERT INTO oidc_webhook_outbox (payload, signature, attempts, next_attempt_at, created_at) VALUES (?, ?, 0, ?, ?)'
  ).run(payload, signature, now, now)
}

// dueRetries returns all pending outbox rows whose next_attempt_at <= now
// and that have not exceeded the maximum attempt count.
// Rows with attempts >= 10 are considered permanently failed and excluded.
export function dueRetries(db, now = Math.floor(Date.now() / 1000)) {
  return db.prepare(
    'SELECT * FROM oidc_webhook_outbox WHERE delivered_at IS NULL AND next_attempt_at <= ? AND attempts < 10'
  ).all(now)
}

// markDelivered stamps the delivered_at column on a successfully sent row.
export function markDelivered(db, id, now = Math.floor(Date.now() / 1000)) {
  db.prepare('UPDATE oidc_webhook_outbox SET delivered_at = ? WHERE id = ?').run(now, id)
}

// scheduleRetry increments the attempt counter and sets the next retry time
// using exponential backoff: min(2^attempts * 30, 3600) seconds.
// attempts here is the new value (already incremented by the caller).
export function scheduleRetry(db, id, attempts, now = Math.floor(Date.now() / 1000)) {
  const backoff = Math.min(Math.pow(2, attempts) * 30, 3600)
  const nextAttempt = now + backoff
  db.prepare('UPDATE oidc_webhook_outbox SET attempts = ?, next_attempt_at = ? WHERE id = ?')
    .run(attempts, nextAttempt, id)
}
