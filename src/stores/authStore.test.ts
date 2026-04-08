import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useAuthStore } from './authStore'

// Minimal localStorage shim -- vitest's jsdom env may or may not have
// one depending on the environment file; this guards against either.
const memStore: Record<string, string> = {}
const localStorageMock = {
  getItem: (k: string) => (k in memStore ? memStore[k] : null),
  setItem: (k: string, v: string) => { memStore[k] = String(v) },
  removeItem: (k: string) => { delete memStore[k] },
  clear: () => { for (const k of Object.keys(memStore)) delete memStore[k] },
}
if (typeof globalThis.localStorage === 'undefined') {
  // @ts-expect-error -- vitest test env shim
  globalThis.localStorage = localStorageMock
}

function resetAuth() {
  useAuthStore.setState({
    username: null,
    authToken: null,
    encryptionKey: null,
    isAuthenticated: false,
    canShareProjects: null,
  })
  localStorageMock.clear()
}

describe('authStore', () => {
  beforeEach(() => {
    resetAuth()
    vi.restoreAllMocks()
  })
  afterEach(() => {
    resetAuth()
    vi.restoreAllMocks()
  })

  it('starts with canShareProjects = null (unknown)', () => {
    expect(useAuthStore.getState().canShareProjects).toBe(null)
  })

  it('captures canShareProjects=true from a successful login response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, role: 'user', maxProjects: 100, canShareProjects: true }),
    } as any)

    const ok = await useAuthStore.getState().login('alice', 'pw')
    expect(ok).toBe(true)
    expect(useAuthStore.getState().canShareProjects).toBe(true)
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('captures canShareProjects=false from a successful login response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, role: 'user', maxProjects: 10, canShareProjects: false }),
    } as any)

    await useAuthStore.getState().login('bob', 'pw')
    expect(useAuthStore.getState().canShareProjects).toBe(false)
  })

  it('leaves canShareProjects=null if the server omits the field', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, role: 'user' }),  // legacy server, no caps
    } as any)

    await useAuthStore.getState().login('carol', 'pw')
    expect(useAuthStore.getState().canShareProjects).toBe(null)
  })

  it('logout() clears canShareProjects', async () => {
    useAuthStore.setState({
      username: 'alice', authToken: 'tok', isAuthenticated: true, canShareProjects: true,
    })
    useAuthStore.getState().logout()
    expect(useAuthStore.getState().canShareProjects).toBe(null)
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('refreshProfile() updates canShareProjects from a fresh login call', async () => {
    useAuthStore.setState({ username: 'alice', authToken: 'tok' })

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, canShareProjects: true }),
    } as any)

    await useAuthStore.getState().refreshProfile()
    expect(useAuthStore.getState().canShareProjects).toBe(true)
  })

  it('refreshProfile() is a no-op if the user is not authenticated', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    await useAuthStore.getState().refreshProfile()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refreshProfile() leaves canShareProjects unchanged on network error', async () => {
    useAuthStore.setState({ username: 'alice', authToken: 'tok', canShareProjects: true })

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'))

    await useAuthStore.getState().refreshProfile()
    expect(useAuthStore.getState().canShareProjects).toBe(true)
  })

  it('refreshProfile() leaves canShareProjects unchanged when the server omits the field', async () => {
    useAuthStore.setState({ username: 'alice', authToken: 'tok', canShareProjects: false })

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    } as any)

    await useAuthStore.getState().refreshProfile()
    expect(useAuthStore.getState().canShareProjects).toBe(false)
  })
})
