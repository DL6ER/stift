import { test } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { initOutboxSchema, enqueueWebhook, dueRetries, markDelivered, scheduleRetry, purgeDelivered, purgePermanentlyFailed } from '../lib/oidc-outbox.js'

function freshDb() {
  const db = new Database(':memory:')
  initOutboxSchema(db)
  return db
}

const NOW = 1_700_000_000 // fixed Unix timestamp for deterministic tests

test('enqueueWebhook + dueRetries: enqueued row is returned', () => {
  const db = freshDb()
  enqueueWebhook(db, '{"event":"user.created"}', 'sig-abc', NOW)
  const rows = dueRetries(db, NOW)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].payload, '{"event":"user.created"}')
  assert.equal(rows[0].signature, 'sig-abc')
})

test('markDelivered: delivered row no longer appears in dueRetries', () => {
  const db = freshDb()
  enqueueWebhook(db, '{"event":"user.created"}', 'sig-xyz', NOW)
  const [row] = dueRetries(db, NOW)
  markDelivered(db, row.id, NOW)
  const after = dueRetries(db, NOW)
  assert.equal(after.length, 0)
})

test('scheduleRetry with attempts=3: next_attempt_at = now + 240, attempts = 3', () => {
  const db = freshDb()
  enqueueWebhook(db, '{"event":"user.created"}', 'sig-retry', NOW)
  const [row] = dueRetries(db, NOW)
  scheduleRetry(db, row.id, 3, NOW)
  const updated = db.prepare('SELECT * FROM oidc_webhook_outbox WHERE id = ?').get(row.id)
  // 2^3 * 30 = 240 seconds
  assert.equal(updated.attempts, 3)
  assert.equal(updated.next_attempt_at, NOW + 240)
})

test('scheduleRetry caps backoff at 3600 seconds', () => {
  const db = freshDb()
  enqueueWebhook(db, '{"event":"user.created"}', 'sig-cap', NOW)
  const [row] = dueRetries(db, NOW)
  // attempts=8 -> 2^8 * 30 = 7680 > 3600, should be capped at 3600
  scheduleRetry(db, row.id, 8, NOW)
  const updated = db.prepare('SELECT * FROM oidc_webhook_outbox WHERE id = ?').get(row.id)
  assert.equal(updated.next_attempt_at, NOW + 3600)
})

test('dueRetries excludes rows with attempts >= 10 (permanently failed)', () => {
  const db = freshDb()
  enqueueWebhook(db, '{"event":"user.created"}', 'sig-perm', NOW)
  const [row] = dueRetries(db, NOW)
  // Simulate 10 failed attempts.
  scheduleRetry(db, row.id, 10, NOW)
  // Override next_attempt_at to be in the past so the time filter is not the cause of exclusion.
  db.prepare('UPDATE oidc_webhook_outbox SET next_attempt_at = ? WHERE id = ?').run(NOW - 1, row.id)
  const after = dueRetries(db, NOW)
  assert.equal(after.length, 0, 'permanently failed row must not be retried')
})

test('purgePermanentlyFailed drops rows with attempts >= 10 older than retention, keeps still-retrying', () => {
  const db = freshDb()
  // A row stamped 100 days old and stuck at 10 attempts: permanently failed, ripe for purge.
  enqueueWebhook(db, '{"event":"stuck-old"}',   'sig-old',    NOW - 100 * 24 * 3600)
  // A row stamped 5 days old at 10 attempts: failed, but recent; keep it for operator inspection.
  enqueueWebhook(db, '{"event":"stuck-recent"}', 'sig-recent', NOW - 5  * 24 * 3600)
  // A row at 5 attempts (still retrying): never purged regardless of age.
  enqueueWebhook(db, '{"event":"retrying"}',     'sig-retry',  NOW - 100 * 24 * 3600)
  const rows = db.prepare('SELECT id, payload FROM oidc_webhook_outbox ORDER BY id').all()
  scheduleRetry(db, rows[0].id, 10, NOW - 100 * 24 * 3600)
  scheduleRetry(db, rows[1].id, 10, NOW - 5  * 24 * 3600)
  scheduleRetry(db, rows[2].id, 5,  NOW - 100 * 24 * 3600)

  const removed = purgePermanentlyFailed(db, NOW)
  assert.equal(removed, 1, 'only the 100-day-old permanently-failed row is purged')

  const remaining = db.prepare('SELECT payload FROM oidc_webhook_outbox ORDER BY id').all().map(r => r.payload)
  assert.deepEqual(remaining, ['{"event":"stuck-recent"}', '{"event":"retrying"}'])
})

test('purgeDelivered drops rows older than retention window, keeps recent and pending', () => {
  const db = freshDb()
  enqueueWebhook(db, '{"event":"old"}',    'sig-old',    NOW - 40 * 24 * 3600)
  enqueueWebhook(db, '{"event":"recent"}', 'sig-recent', NOW - 5  * 24 * 3600)
  enqueueWebhook(db, '{"event":"pending"}','sig-pending', NOW)
  const ids = db.prepare('SELECT id, payload FROM oidc_webhook_outbox ORDER BY id').all()
  markDelivered(db, ids[0].id, NOW - 40 * 24 * 3600)
  markDelivered(db, ids[1].id, NOW - 5  * 24 * 3600)

  const removed = purgeDelivered(db, NOW)
  assert.equal(removed, 1, 'only the 40-day-old delivered row is purged')

  const remaining = db.prepare('SELECT payload FROM oidc_webhook_outbox ORDER BY id').all().map(r => r.payload)
  assert.deepEqual(remaining, ['{"event":"recent"}', '{"event":"pending"}'])
})
