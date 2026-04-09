import { useState } from 'react'
import { X, Shield, AlertTriangle } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { useConfigStore } from '../stores/configStore'

interface Props {
  onClose: () => void
  onSuccess: () => void
  inviteToken?: string
}

export function AuthDialog({ onClose, onSuccess, inviteToken }: Props) {
  const registrationEnabled = useConfigStore((s) => s.registrationEnabled)
  const sponsorUrl = useConfigStore((s) => s.sponsorUrl)
  const [mode, setMode] = useState<'login' | 'register'>(inviteToken ? 'register' : 'login')
  // With an invite the user can either create a new account OR sign in
  // to apply the invite to an existing one. Without an invite, fall
  // back to login if public registration is closed.
  const effectiveMode: 'login' | 'register' = inviteToken ? mode : (registrationEnabled ? mode : 'login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const login = useAuthStore((s) => s.login)
  const register = useAuthStore((s) => s.register)
  const registerWithInvite = useAuthStore((s) => s.registerWithInvite)
  const loginAndApplyInvite = useAuthStore((s) => s.loginAndApplyInvite)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!username || !password) { setError('Username and password required'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (effectiveMode === 'register' && password !== confirmPassword) { setError('Passwords do not match'); return }

    setLoading(true)
    try {
      if (effectiveMode === 'login' && inviteToken) {
        // Existing user applying an invite to their account
        try {
          await loginAndApplyInvite(username, password, inviteToken)
          onSuccess()
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not apply invitation')
        }
      } else if (effectiveMode === 'login') {
        const success = await login(username, password)
        if (success) onSuccess()
        else setError('Invalid username or password')
      } else if (inviteToken) {
        try {
          await registerWithInvite(username, password, inviteToken)
          onSuccess()
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Registration failed')
        }
      } else {
        const success = await register(username, password)
        if (success) onSuccess()
        else setError('Registration failed (user may already exist)')
      }
    } catch {
      setError('Connection failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-raised border border-border rounded-xl shadow-2xl w-[420px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <Shield size={20} className="text-emerald-400" />
            <h2 className="text-lg font-semibold text-gray-200">{effectiveMode === 'login' ? 'Sign In' : 'Create Account'}</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
          {inviteToken && (
            <div className="bg-indigo-950/30 border border-indigo-800/40 rounded-lg p-3 text-xs text-indigo-300">
              You're creating an account with an invitation. Pick any username and a password you can remember; your encryption key is derived from both.
            </div>
          )}
          <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-lg p-3 text-xs text-emerald-400/80">
            <div className="flex gap-2">
              <Shield size={14} className="shrink-0 mt-0.5" />
              <div>
                <strong className="text-emerald-300">End-to-end encrypted</strong>
                <p className="mt-1">Your data is encrypted with your personal key before it is uploaded. The server cannot read your projects.</p>
              </div>
            </div>
          </div>

          {effectiveMode === 'register' && (
            <div className="bg-amber-950/30 border border-amber-800/40 rounded-lg p-3 text-xs text-amber-400/80">
              <div className="flex gap-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <div>
                  <strong className="text-amber-300">No password recovery</strong>
                  <p className="mt-1">Your encryption key is inextricably linked to your password. If you lose the password, your server-stored data cannot be recovered by anyone, including us. Keep your password safe.</p>
                </div>
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-400">Username</label>
              {effectiveMode === 'register' && (
                <button type="button" onClick={() => {
                  const adj = ['swift','bright','calm','bold','keen','wise','fair','true','deep','vast']
                  const noun = ['fox','owl','hawk','wolf','bear','lynx','elk','hare','crow','wren']
                  const num = Math.floor(Math.random() * 900) + 100
                  setUsername(`${adj[Math.floor(Math.random()*adj.length)]}-${noun[Math.floor(Math.random()*noun.length)]}-${num}`)
                }} className="text-[10px] text-accent hover:underline">Generate random</button>
              )}
            </div>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus
              placeholder={effectiveMode === 'register' ? 'Choose a username or generate one' : 'Your username'}
              className="w-full bg-surface-overlay border border-border rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-accent" />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
              className="w-full bg-surface-overlay border border-border rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-accent" />
          </div>

          {effectiveMode === 'register' && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Confirm Password</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required
                className="w-full bg-surface-overlay border border-border rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-accent" />
            </div>
          )}

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full py-2 bg-accent hover:bg-accent-hover text-white rounded-md font-medium text-sm disabled:opacity-50">
            {loading ? 'Please wait...' : effectiveMode === 'login' ? (inviteToken ? 'Sign In and Apply Invitation' : 'Sign In') : 'Create Account'}
          </button>

          {inviteToken ? (
            <p className="text-center text-xs text-gray-500">
              {effectiveMode === 'register' ? (
                <>Already have an account? <button type="button" onClick={() => setMode('login')} className="text-accent hover:underline">Sign in to apply this invitation</button></>
              ) : (
                <>New here? <button type="button" onClick={() => setMode('register')} className="text-accent hover:underline">Create a new account</button></>
              )}
            </p>
          ) : registrationEnabled ? (
            <p className="text-center text-xs text-gray-500">
              {effectiveMode === 'login' ? (
                <>No account? <button type="button" onClick={() => setMode('register')} className="text-accent hover:underline">Create one</button></>
              ) : (
                <>Already have an account? <button type="button" onClick={() => setMode('login')} className="text-accent hover:underline">Sign in</button></>
              )}
            </p>
          ) : sponsorUrl ? (
            <div className="text-center text-xs text-gray-500 space-y-1">
              <p>New here? Cloud storage is invite-only on this instance.</p>
              <a
                href={sponsorUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-accent hover:underline font-medium"
              >
                Become a sponsor →
              </a>
            </div>
          ) : (
            <p className="text-center text-xs text-gray-500">Registration is disabled on this instance.</p>
          )}
        </form>
      </div>
    </div>
  )
}
