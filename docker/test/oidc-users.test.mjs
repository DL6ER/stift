import { test } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { initUserSchema, findOrCreateUser } from '../lib/oidc-users.js'

function freshDb() {
  const db = new Database(':memory:')
  initUserSchema(db)
  return db
}

test('initUserSchema + findOrCreateUser: creates new user, created === true', () => {
  const db = freshDb()
  const { user, created } = findOrCreateUser(db, { externalId: 'sub-001', email: 'a@example.com' })
  assert.equal(created, true)
  assert.ok(user.username)
  assert.equal(user.external_oidc_sub, 'sub-001')
  assert.equal(user.email, 'a@example.com')
})

test('findOrCreateUser twice with same externalId: second call returns created === false, same id', () => {
  const db = freshDb()
  const first = findOrCreateUser(db, { externalId: 'sub-002', email: 'b@example.com' })
  assert.equal(first.created, true)

  const second = findOrCreateUser(db, { externalId: 'sub-002', email: 'b@example.com' })
  assert.equal(second.created, false)
  assert.equal(second.user.username, first.user.username)
})

test('findOrCreateUser with 10 parallel calls on same externalId: exactly 1 created, 9 not created', async () => {
  const db = freshDb()
  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      Promise.resolve(findOrCreateUser(db, { externalId: 'sub-race', email: 'race@example.com' }))
    )
  )
  const createdCount = results.filter(r => r.created).length
  const notCreatedCount = results.filter(r => !r.created).length
  assert.equal(createdCount, 1, 'exactly one call should report created')
  assert.equal(notCreatedCount, 9, 'nine calls should report not created')

  const rows = db.prepare('SELECT * FROM users WHERE external_oidc_sub = ?').all('sub-race')
  assert.equal(rows.length, 1, 'exactly one row in DB')

  // All results must reference the same username.
  const usernames = new Set(results.map(r => r.user.username))
  assert.equal(usernames.size, 1, 'all results must point to the same username')
})

test('findOrCreateUser updates email when email changes for same sub', () => {
  const db = freshDb()
  findOrCreateUser(db, { externalId: 'sub-003', email: 'old@example.com' })
  const { user, created } = findOrCreateUser(db, { externalId: 'sub-003', email: 'new@example.com' })
  assert.equal(created, false)
  assert.equal(user.email, 'new@example.com')
})

test('findOrCreateUser refuses to rebind an already-OIDC-linked row by email', () => {
  const db = freshDb()
  const first = findOrCreateUser(db, { externalId: 'sub-victim', email: 'shared@example.com' })
  assert.equal(first.created, true)

  // A second IdP asserts the same email with a different sub. The existing
  // row already has an external_oidc_sub, so it must not be rebound.
  const second = findOrCreateUser(db, { externalId: 'sub-attacker', email: 'shared@example.com' })
  assert.equal(second.created, true)
  assert.notEqual(second.user.username, first.user.username)

  const victimRow = db.prepare('SELECT * FROM users WHERE username = ?').get(first.user.username)
  assert.equal(victimRow.external_oidc_sub, 'sub-victim', 'victim sub unchanged')
})

test('findOrCreateUser links by email only when existing row has no sub', () => {
  const db = freshDb()
  // Simulate a pre-existing password-flow account (external_oidc_sub NULL).
  db.prepare(`
    INSERT INTO users (username, auth_token, role, max_projects, can_share_projects, created_at, email)
    VALUES (?, ?, 'user', 50, 1, ?, ?)
  `).run('legacy-user', 'plain-token', new Date().toISOString(), 'legacy@example.com')

  const { user, created } = findOrCreateUser(db, { externalId: 'sub-legacy', email: 'legacy@example.com' })
  assert.equal(created, false)
  assert.equal(user.username, 'legacy-user')
  assert.equal(user.external_oidc_sub, 'sub-legacy')
})
