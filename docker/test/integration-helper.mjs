// Spawn an actual server.js process against a throwaway DATA_DIR and
// expose a tiny fetch wrapper plus a stop() that drains the child and
// removes the temp tree. Used by the api-integration tests so they hit
// the real route handler stack, parseBody, sanitizeUsername, etc. -- not
// a mock surface that drifts from production behaviour.
//
// OIDC routes need a real identity provider, so they are out of scope
// here; the helper deliberately runs with OIDC_ENABLED=false.

import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:net'

const HERE = dirname(fileURLToPath(import.meta.url))
const DOCKER_DIR = resolve(HERE, '..')
const SERVER_ENTRY = join(DOCKER_DIR, 'server.js')

// Ask the OS for an unused TCP port, then close the probe socket and
// hand the port number to the server. There is a small race window
// where another process could grab the port between close and bind,
// but for a single test runner on a developer machine that is fine --
// and the alternative (hardcoded 3001) clashes with anything already
// listening there.
async function pickFreePort() {
  return await new Promise((resolveFn, rejectFn) => {
    const probe = createServer()
    probe.unref()
    probe.on('error', rejectFn)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolveFn(port))
    })
  })
}

// One server per test file but multiple tests share it. Each test should
// register its own user so it does not collide with another test's state.
export async function startServer(extraEnv = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'stift-it-'))
  const port = await pickFreePort()
  const proc = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: DOCKER_DIR,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      DATA_DIR: dataDir,
      ALLOW_REGISTRATION: 'true',
      DEV_MODE: 'false',
      NODE_ENV: 'test',
      STIFT_API_PORT: String(port),
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const logs = { stdout: '', stderr: '' }
  proc.stdout.on('data', (b) => { logs.stdout += b.toString() })
  proc.stderr.on('data', (b) => { logs.stderr += b.toString() })

  const baseUrl = `http://127.0.0.1:${port}`
  let ready = false
  for (let i = 0; i < 100; i++) {
    if (proc.exitCode !== null) break
    try {
      const r = await fetch(`${baseUrl}/api/config`)
      if (r.ok) { ready = true; break }
    } catch {}
    await new Promise((r) => setTimeout(r, 50))
  }
  if (!ready) {
    proc.kill('SIGKILL')
    await rm(dataDir, { recursive: true, force: true })
    throw new Error(
      `server did not become ready in 5s\nstdout:\n${logs.stdout}\nstderr:\n${logs.stderr}`
    )
  }

  async function http(method, path, { headers = {}, body, rawBody, ip } = {}) {
    // Spoof a fresh X-Forwarded-For per request so the per-IP rate limiter
    // does not collide across tests. The server only trusts XFF when the
    // immediate peer is loopback, which is the case here.
    const fakeIp = ip || `203.0.113.${Math.floor(Math.random() * 254) + 1}`
    const opts = {
      method,
      headers: { 'X-Forwarded-For': fakeIp, ...headers },
    }
    if (rawBody !== undefined) {
      opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json'
      opts.body = rawBody
    } else if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json'
      opts.body = JSON.stringify(body)
    }
    const res = await fetch(baseUrl + path, opts)
    let json = null
    const text = await res.text()
    if (text) {
      try { json = JSON.parse(text) } catch {}
    }
    return { status: res.status, json, text, headers: res.headers }
  }

  return {
    baseUrl,
    http,
    logs,
    async stop() {
      proc.kill('SIGTERM')
      await new Promise((r) => proc.once('close', r))
      await rm(dataDir, { recursive: true, force: true })
    },
  }
}

// Convenience: register + login a fresh user; returns the bearer token
// the routes expect via X-Auth-Token + X-Auth-Username.
export async function registerAndLogin(srv, { username, authToken }) {
  const reg = await srv.http('POST', '/api/auth/register', {
    body: { username, authToken },
  })
  if (!(reg.status === 201 || reg.status === 409)) {
    throw new Error(`register failed: ${reg.status} ${reg.text}`)
  }
  const login = await srv.http('POST', '/api/auth/login', {
    body: { username, authToken },
  })
  if (login.status !== 200) throw new Error(`login failed: ${login.status} ${login.text}`)
  return {
    headers: { 'X-Auth-Username': username, 'X-Auth-Token': authToken },
    profile: login.json,
  }
}
