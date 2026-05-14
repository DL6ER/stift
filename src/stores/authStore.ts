import { create } from 'zustand'
import { deriveKey, deriveAuthToken, encrypt, decrypt } from '../lib/crypto'
import { registerWithInvite as apiRegisterWithInvite, applyInvite as apiApplyInvite } from '../lib/api'
import { clearAutosave } from '../lib/autosave'

// Known plaintext encrypted with the user's passphrase-derived key. The
// SPA stores the ciphertext server-side and re-derives + decrypts it on
// every later sign-in to confirm the user typed the right passphrase
// without sending it to the server.
const ENCRYPTION_VERIFICATION_PLAINTEXT = 'stift-encryption-verification-v1'

interface AuthState {
  username: string | null
  authToken: string | null
  encryptionKey: CryptoKey | null
  isAuthenticated: boolean
  canShareProjects: boolean | null
  // True when an OIDC sign-in is active but the SPA has not yet derived
  // the E2E encryption key from the user's separate passphrase. Server
  // round-trip and SPA logic both gate on this flag.
  oidcNeedsUnlock: boolean

  login: (username: string, password: string) => Promise<boolean>
  register: (username: string, password: string) => Promise<boolean>
  registerWithInvite: (username: string, password: string, invite: string) => Promise<void>
  loginAndApplyInvite: (username: string, password: string, invite: string) => Promise<void>
  refreshProfile: () => Promise<void>
  hydrateOidcSession: () => Promise<void>
  setupOidcEncryption: (passphrase: string) => Promise<{ ok: true } | { ok: false; error: string }>
  unlockOidcEncryption: (passphrase: string) => Promise<{ ok: true } | { ok: false; error: string }>
  logout: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  username: null,
  authToken: null,
  encryptionKey: null,
  isAuthenticated: false,
  canShareProjects: null,
  oidcNeedsUnlock: false,

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

  // hydrateOidcSession brings the SPA back into the authenticated state
  // after the OIDC bridge page has dropped username + authToken into
  // localStorage. The encryption key still needs to be unlocked via the
  // user's separate passphrase -- oidcNeedsUnlock=true gates the SPA on
  // that follow-up step.
  hydrateOidcSession: async () => {
    if (localStorage.getItem('stift-auth-source') !== 'oidc') return
    const username = localStorage.getItem('stift-auth-username')
    const authToken = localStorage.getItem('stift-auth-token')
    if (!username || !authToken) return
    set({
      username,
      authToken,
      encryptionKey: null,
      isAuthenticated: true,
      oidcNeedsUnlock: true,
    })
    // Pull canShareProjects + maxProjects so capability-gated UI works.
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, authToken }),
      })
      if (r.ok) {
        const data = await r.json().catch(() => ({}))
        if (typeof data.canShareProjects === 'boolean') {
          set({ canShareProjects: data.canShareProjects })
        }
      }
    } catch {}
  },

  // First-time OIDC encryption setup: derive a key from the passphrase,
  // encrypt the well-known verification plaintext, and PUT the ciphertext
  // server-side. Server refuses to overwrite an existing blob, so this
  // is safe to call even if a parallel tab raced ahead -- the second
  // call will fall back to unlockOidcEncryption.
  setupOidcEncryption: async (passphrase) => {
    const username = get().username
    if (!username) return { ok: false, error: 'Not authenticated' }
    if (!passphrase || passphrase.length < 8) {
      return { ok: false, error: 'Passphrase must be at least 8 characters' }
    }
    try {
      const key = await deriveKey(passphrase, username)
      const blob = await encrypt(key, ENCRYPTION_VERIFICATION_PLAINTEXT)
      const r = await fetch('/api/oidc/encryption-verification', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ verification: blob }),
      })
      if (r.status === 409) {
        // Another tab/device already set the verification first. Try to
        // unlock with the same passphrase; if that succeeds we are good,
        // otherwise the user typed a different passphrase than the one
        // already on file.
        return await get().unlockOidcEncryption(passphrase)
      }
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        return { ok: false, error: err?.error || 'Failed to save verification' }
      }
      set({ encryptionKey: key, oidcNeedsUnlock: false })
      return { ok: true }
    } catch (e) {
      return { ok: false, error: 'Encryption setup failed' }
    }
  },

  // Returning OIDC sign-in: fetch the stored verification ciphertext,
  // derive the candidate key from the passphrase, decrypt the blob, and
  // confirm it matches the well-known plaintext. Wrong passphrase fails
  // the AES-GCM auth tag and we report it as a passphrase mismatch.
  unlockOidcEncryption: async (passphrase) => {
    const username = get().username
    if (!username) return { ok: false, error: 'Not authenticated' }
    try {
      const r = await fetch('/api/oidc/encryption-verification', {
        credentials: 'same-origin',
      })
      if (!r.ok) {
        return { ok: false, error: 'Failed to load verification' }
      }
      const data = await r.json().catch(() => ({}))
      if (!data.verification) {
        return { ok: false, error: 'No verification on file -- run setup instead' }
      }
      const key = await deriveKey(passphrase, username)
      let plaintext: string
      try {
        plaintext = await decrypt(key, data.verification)
      } catch {
        return { ok: false, error: 'Wrong passphrase' }
      }
      if (plaintext !== ENCRYPTION_VERIFICATION_PLAINTEXT) {
        return { ok: false, error: 'Wrong passphrase' }
      }
      set({ encryptionKey: key, oidcNeedsUnlock: false })
      return { ok: true }
    } catch {
      return { ok: false, error: 'Unlock failed' }
    }
  },

  logout: () => {
    // For OIDC sessions also invalidate the server-side session entry so
    // the cached plaintext bearer token disappears from the in-memory
    // sessions map. Fire-and-forget: any failure (network blip, server
    // down) must not block the local clear-out.
    if (localStorage.getItem('stift-auth-source') === 'oidc') {
      fetch('/api/oidc/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {})
    }
    set({ username: null, authToken: null, encryptionKey: null, isAuthenticated: false, canShareProjects: null, oidcNeedsUnlock: false })
    localStorage.removeItem('stift-auth-username')
    localStorage.removeItem('stift-auth-token')
    localStorage.removeItem('stift-auth-source')
    // Drop the in-flight autosave snapshot so the next user on the same
    // browser does not get a restore prompt for the previous user's work.
    clearAutosave()
  },
}))
