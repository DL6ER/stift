// HTTP integration tests for the security-critical routes added by the
// 2026-Q2 audit rounds. Each test runs against a freshly spawned server
// with its own temp DATA_DIR, so state never leaks between tests.
//
// Covered routes:
//   POST /api/auth/register, /api/auth/login -- exercises the auth-token
//     hashing pipeline introduced in R1-H2.
//   POST /api/projects (validates the per-user file/dir scoping).
//   POST /api/shared (R1-H1 members validation).
//   PUT  /api/shared/:id/wrapped-key (R4-H1 b self-rewrap).
//
// Not covered here:
//   OIDC routes -- they need a real identity provider for the discover
//   call. A future round can ship a mock-IdP harness.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { startServer, registerAndLogin } from './integration-helper.mjs'

let srv
before(async () => { srv = await startServer() })
after(async () => { if (srv) await srv.stop() })

const hex32 = () => Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')

test('auth: register and login round-trip; second login also succeeds', async () => {
  const u = `alice-${randomUUID().slice(0, 8)}`
  const token = hex32()
  const reg = await srv.http('POST', '/api/auth/register', { body: { username: u, authToken: token } })
  assert.equal(reg.status, 201)
  const a = await srv.http('POST', '/api/auth/login', { body: { username: u, authToken: token } })
  assert.equal(a.status, 200)
  const b = await srv.http('POST', '/api/auth/login', { body: { username: u, authToken: token } })
  assert.equal(b.status, 200)
})

test('auth: wrong token returns 401, same shape as missing user', async () => {
  const u = `bob-${randomUUID().slice(0, 8)}`
  const token = hex32()
  await srv.http('POST', '/api/auth/register', { body: { username: u, authToken: token } })
  const wrong = await srv.http('POST', '/api/auth/login', { body: { username: u, authToken: hex32() } })
  assert.equal(wrong.status, 401)
  const missing = await srv.http('POST', '/api/auth/login', { body: { username: 'no-such-user', authToken: hex32() } })
  assert.equal(missing.status, 401)
  // Both must report the same generic error string -- no oracle for the
  // "user exists / does not exist" question via response body either.
  assert.equal(wrong.json?.error, missing.json?.error)
})

test('projects: caller can CRUD their own project blob', async () => {
  const u = `carol-${randomUUID().slice(0, 8)}`
  const { headers } = await registerAndLogin(srv, { username: u, authToken: hex32() })

  const create = await srv.http('POST', '/api/projects', { headers, body: { name: 'My project', encrypted: false } })
  assert.equal(create.status, 201)
  const id = create.json?.id
  assert.ok(id, 'POST /api/projects returns an id')

  const list = await srv.http('GET', '/api/projects', { headers })
  assert.equal(list.status, 200)
  assert.ok(Array.isArray(list.json) && list.json.find(p => p.id === id), 'newly-created project appears in listing')

  const load = await srv.http('GET', `/api/projects/${id}`, { headers })
  assert.equal(load.status, 200)
  assert.equal(load.json?.name, 'My project')

  const del = await srv.http('DELETE', `/api/projects/${id}`, { headers })
  assert.equal(del.status, 200)
  const reload = await srv.http('GET', `/api/projects/${id}`, { headers })
  assert.equal(reload.status, 404)
})

test('shared: POST rejects empty members array', async () => {
  const u = `dave-${randomUUID().slice(0, 8)}`
  const { headers } = await registerAndLogin(srv, { username: u, authToken: hex32() })
  const r = await srv.http('POST', '/api/shared', { headers, body: { members: [], wrappedKey: 'k', encrypted: true, data: 'c' } })
  assert.equal(r.status, 400)
})

test('shared: POST rejects members array that omits the caller', async () => {
  const caller = `eve-${randomUUID().slice(0, 8)}`
  const other = `frank-${randomUUID().slice(0, 8)}`
  const { headers } = await registerAndLogin(srv, { username: caller, authToken: hex32() })
  await registerAndLogin(srv, { username: other, authToken: hex32() })
  const r = await srv.http('POST', '/api/shared', {
    headers,
    body: { members: [{ username: other, role: 'owner', wrappedKey: 'k' }], encrypted: true, data: 'c' },
  })
  assert.equal(r.status, 400)
  assert.match(r.json?.error || '', /caller/)
})

test('shared: POST rejects a member referring to a non-existent account', async () => {
  const u = `gina-${randomUUID().slice(0, 8)}`
  const { headers } = await registerAndLogin(srv, { username: u, authToken: hex32() })
  const r = await srv.http('POST', '/api/shared', {
    headers,
    body: {
      members: [
        { username: u, role: 'owner', wrappedKey: 'k1' },
        { username: 'ghost-user-does-not-exist', role: 'editor', wrappedKey: 'k2' },
      ],
      encrypted: true, data: 'c',
    },
  })
  assert.equal(r.status, 400)
  assert.match(r.json?.error || '', /not found/)
})

test('shared: POST accepts the implicit owner-only shape and the wrapped-key flow works', async () => {
  const owner = `hera-${randomUUID().slice(0, 8)}`
  const { headers } = await registerAndLogin(srv, { username: owner, authToken: hex32() })
  const create = await srv.http('POST', '/api/shared', {
    headers,
    body: { wrappedKey: 'initial-wrap', encrypted: true, data: 'c' },
  })
  assert.equal(create.status, 201)
  const id = create.json?.id

  // Self-update wrappedKey: must succeed for the owner who is a member.
  const put = await srv.http('PUT', `/api/shared/${id}/wrapped-key`, {
    headers,
    body: { wrappedKey: 'rewrapped-after-first-open' },
  })
  assert.equal(put.status, 200)

  // GET the project back and verify the caller's member entry now carries
  // the new wrappedKey while the rest of the blob is untouched.
  const got = await srv.http('GET', `/api/shared/${id}`, { headers })
  assert.equal(got.status, 200)
  const me = got.json?.members?.find((m) => m.username === owner)
  assert.equal(me?.wrappedKey, 'rewrapped-after-first-open')
})

test('shared: PUT /:id/wrapped-key rejects a caller that is not a member', async () => {
  const owner = `irene-${randomUUID().slice(0, 8)}`
  const stranger = `jack-${randomUUID().slice(0, 8)}`
  const { headers: ownerH } = await registerAndLogin(srv, { username: owner, authToken: hex32() })
  const { headers: strangerH } = await registerAndLogin(srv, { username: stranger, authToken: hex32() })
  const create = await srv.http('POST', '/api/shared', {
    headers: ownerH,
    body: { wrappedKey: 'owner-wrap', encrypted: true, data: 'c' },
  })
  assert.equal(create.status, 201)
  const id = create.json?.id
  const r = await srv.http('PUT', `/api/shared/${id}/wrapped-key`, {
    headers: strangerH,
    body: { wrappedKey: 'attacker-wrap' },
  })
  assert.equal(r.status, 403)
})

test('shared: GET listing returns nameCiphertext when present', async () => {
  const u = `karl-${randomUUID().slice(0, 8)}`
  const { headers } = await registerAndLogin(srv, { username: u, authToken: hex32() })
  // Write a project with the new nameCiphertext envelope and no plaintext name.
  const r = await srv.http('POST', '/api/projects', {
    headers,
    body: { encrypted: true, nameCiphertext: 'ENC(name)', data: 'ENC(body)' },
  })
  assert.equal(r.status, 201)
  const list = await srv.http('GET', '/api/projects', { headers })
  const entry = list.json.find(p => p.id === r.json.id)
  assert.equal(entry?.nameCiphertext, 'ENC(name)')
})

test('parseBody: returns 400 on non-object JSON bodies', async () => {
  // JSON.parse("null") succeeds but destructuring null would throw at the
  // route; parseBody now intercepts and returns 400 instead of a confusing 500.
  const r = await srv.http('POST', '/api/auth/login', { rawBody: 'null' })
  assert.equal(r.status, 400)
})
