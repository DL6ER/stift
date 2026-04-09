import { create } from 'zustand'
import { deriveKey, deriveAuthToken } from '../lib/crypto'
import { registerWithInvite as apiRegisterWithInvite, applyInvite as apiApplyInvite } from '../lib/api'

interface AuthState {
  username: string | null
  authToken: string | null
  encryptionKey: CryptoKey | null
  isAuthenticated: boolean
  canShareProjects: boolean | null

  login: (username: string, password: string) => Promise<boolean>
  register: (username: string, password: string) => Promise<boolean>
  registerWithInvite: (username: string, password: string, invite: string) => Promise<void>
  loginAndApplyInvite: (username: string, password: string, invite: string) => Promise<void>
  refreshProfile: () => Promise<void>
  logout: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  username: null,
  authToken: null,
  encryptionKey: null,
  isAuthenticated: false,
  canShareProjects: null,

  login: async (username, password) => {
    try {
      const authToken = await deriveAuthToken(password, username)
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.toLowerCase().trim(), authToken }),
      })
      if (!res.ok) return false

      // The /api/auth/login response carries the user's per-account
      // capabilities (maxProjects, canShareProjects, ...) -- capture
      // them so capability-gated UI doesn't have to make a separate
      // round-trip.
      const data = await res.json().catch(() => ({}))
      const encryptionKey = await deriveKey(password, username)
      set({
        username,
        authToken,
        encryptionKey,
        isAuthenticated: true,
        canShareProjects: typeof data.canShareProjects === 'boolean' ? data.canShareProjects : null,
      })
      localStorage.setItem('stift-auth-username', username)
      localStorage.setItem('stift-auth-token', authToken)
      return true
    } catch {
      return false
    }
  },

  register: async (username, password) => {
    try {
      const authToken = await deriveAuthToken(password, username)
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.toLowerCase().trim(), authToken }),
      })
      if (!res.ok) return false

      const data = await res.json().catch(() => ({}))
      const encryptionKey = await deriveKey(password, username)
      set({
        username,
        authToken,
        encryptionKey,
        isAuthenticated: true,
        canShareProjects: typeof data.canShareProjects === 'boolean' ? data.canShareProjects : null,
      })
      localStorage.setItem('stift-auth-username', username)
      localStorage.setItem('stift-auth-token', authToken)
      return true
    } catch {
      return false
    }
  },

  registerWithInvite: async (username, password, invite) => {
    const authToken = await deriveAuthToken(password, username)
    await apiRegisterWithInvite(username.toLowerCase().trim(), authToken, invite)
    const encryptionKey = await deriveKey(password, username)
    set({ username, authToken, encryptionKey, isAuthenticated: true })
    localStorage.setItem('stift-auth-username', username)
    localStorage.setItem('stift-auth-token', authToken)
    // The register-with-invite endpoint doesn't return capabilities,
    // so make a follow-up login call (using the cached authToken) to
    // pick up canShareProjects + maxProjects on the same auth round-
    // trip pattern as a regular login.
    await get().refreshProfile()
  },

  loginAndApplyInvite: async (username, password, invite) => {
    const authToken = await deriveAuthToken(password, username)
    await apiApplyInvite(username.toLowerCase().trim(), authToken, invite)
    const encryptionKey = await deriveKey(password, username)
    set({ username, authToken, encryptionKey, isAuthenticated: true })
    localStorage.setItem('stift-auth-username', username)
    localStorage.setItem('stift-auth-token', authToken)
    await get().refreshProfile()
  },

  // Re-fetches the current user's per-account capabilities by
  // re-issuing the /api/auth/login call with the cached authToken.
  // Cheap; safe to call multiple times. The login endpoint is the
  // only profile-bearing endpoint the OSS server exposes, so we
  // reuse it as the canonical "fetch current capabilities" call.
  refreshProfile: async () => {
    const { username, authToken } = get()
    if (!username || !authToken) return
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.toLowerCase().trim(), authToken }),
      })
      if (!res.ok) return
      const data = await res.json().catch(() => ({}))
      if (typeof data.canShareProjects === 'boolean') {
        set({ canShareProjects: data.canShareProjects })
      }
    } catch {
      // Network blip -- leave the existing flag in place.
    }
  },

  logout: () => {
    set({ username: null, authToken: null, encryptionKey: null, isAuthenticated: false, canShareProjects: null })
    localStorage.removeItem('stift-auth-username')
    localStorage.removeItem('stift-auth-token')
  },
}))
