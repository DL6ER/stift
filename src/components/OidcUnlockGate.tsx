// Modal shown after an OIDC sign-in until the user has either set up
// their E2E encryption passphrase (first sign-in) or unlocked it
// (returning sign-in). Until that happens server-side projects cannot
// be encrypted/decrypted, so we block the rest of the SPA behind this
// gate.
import { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'

type Mode = 'loading' | 'setup' | 'unlock'

export function OidcUnlockGate() {
  const oidcNeedsUnlock = useAuthStore((s) => s.oidcNeedsUnlock)
  const setupOidcEncryption = useAuthStore((s) => s.setupOidcEncryption)
  const unlockOidcEncryption = useAuthStore((s) => s.unlockOidcEncryption)
  const username = useAuthStore((s) => s.username)
  const logout = useAuthStore((s) => s.logout)

  const [mode, setMode] = useState<Mode>('loading')
  const [passphrase, setPassphrase] = useState('')
  const [confirmPassphrase, setConfirmPassphrase] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Decide setup vs unlock based on whether the server already holds a
  // verification ciphertext for this user.
  useEffect(() => {
    if (!oidcNeedsUnlock) return
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/oidc/encryption-verification', {
          credentials: 'same-origin',
        })
        if (!r.ok) {
          if (!cancelled) setMode('setup')
          return
        }
        const data = await r.json().catch(() => ({}))
        if (cancelled) return
        setMode(data.verification ? 'unlock' : 'setup')
      } catch {
        if (!cancelled) setMode('setup')
      }
    })()
    return () => { cancelled = true }
  }, [oidcNeedsUnlock])

  if (!oidcNeedsUnlock) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (mode === 'setup') {
      if (passphrase !== confirmPassphrase) {
        setError('Passphrases do not match')
        return
      }
      setBusy(true)
      const result = await setupOidcEncryption(passphrase)
      setBusy(false)
      if (!result.ok) setError(result.error)
    } else if (mode === 'unlock') {
      setBusy(true)
      const result = await unlockOidcEncryption(passphrase)
      setBusy(false)
      if (!result.ok) setError(result.error)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-background border border-border rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-md bg-amber-500/10 text-amber-500">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">
              {mode === 'setup' ? 'Set up encryption passphrase' : 'Unlock encryption'}
            </h2>
            <p className="text-xs text-muted-foreground">
              Signed in as <span className="font-mono">{username}</span>
            </p>
          </div>
        </div>

        {mode === 'loading' && (
          <p className="text-sm text-muted-foreground">Checking your account&hellip;</p>
        )}

        {mode !== 'loading' && (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              {mode === 'setup'
                ? 'Pick a passphrase to encrypt your server-stored projects. The server never sees this passphrase -- losing it means losing access to encrypted projects.'
                : 'Enter the encryption passphrase you set when you first signed in. The server never sees this passphrase.'}
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1" htmlFor="oidc-passphrase">
                  Passphrase
                </label>
                <input
                  id="oidc-passphrase"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-border bg-input text-sm"
                />
              </div>

              {mode === 'setup' && (
                <div>
                  <label className="block text-xs font-medium mb-1" htmlFor="oidc-passphrase-confirm">
                    Confirm passphrase
                  </label>
                  <input
                    id="oidc-passphrase-confirm"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={confirmPassphrase}
                    onChange={(e) => setConfirmPassphrase(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-border bg-input text-sm"
                  />
                </div>
              )}

              {error && (
                <div className="text-xs text-red-500" role="alert">{error}</div>
              )}

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={logout}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel sign-in
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
                >
                  {busy ? 'Working&hellip;' : mode === 'setup' ? 'Save passphrase' : 'Unlock'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
