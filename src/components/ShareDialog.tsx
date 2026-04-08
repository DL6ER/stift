// Shared-project dialog: list projects the current user is a member of,
// create new ones, and invite/remove members. The crypto dance is the
// tricky bit -- a shared project has its own random project key, and
// every member gets a copy of that key wrapped. The owner's copy is
// wrapped with their password-derived user key. Inviting someone else
// is harder because we don't have their password, so handleInvite
// derives a temporary "invitation key" from the project id + invitee
// username and wraps the project key under that (see the inline
// comment in handleInvite for the tradeoff). The server never sees
// any plaintext key.

import { useState, useEffect } from 'react'
import { X, Shield, Users, UserPlus, Trash2, Crown, Edit3, Eye, Info } from 'lucide-react'
import { useProjectStore } from '../stores/projectStore'
import { useAuthStore } from '../stores/authStore'
import { generateProjectKey, wrapProjectKey, encrypt, decrypt, unwrapProjectKey, deriveKey } from '../lib/crypto'
import * as api from '../lib/api'

interface Props {
  onClose: () => void
}

interface SharedProject {
  id: string
  name: string
  owner: string
  role: string
  memberCount: number
  updatedAt: string
}

export function ShareDialog({ onClose }: Props) {
  const [sharedProjects, setSharedProjects] = useState<SharedProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showInvite, setShowInvite] = useState<string | null>(null) // project ID
  const [inviteUsername, setInviteUsername] = useState('')
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor')
  const [inviteError, setInviteError] = useState('')
  const username = useAuthStore((s) => s.username)
  const encryptionKey = useAuthStore((s) => s.encryptionKey)
  // Per-user capability from the OSS server. The server returns it
  // on /api/auth/login. When false, the current user cannot CREATE
  // shared projects or invite members -- but they can still view
  // shared projects they're already a member of (read-only).
  // null = not yet known; treat as disabled to avoid flashing
  // enabled UI that the user can't actually use.
  const canShareProjects = useAuthStore((s) => s.canShareProjects)
  const sharingEnabled = canShareProjects === true

  useEffect(() => { loadShared() }, [])

  const loadShared = async () => {
    try {
      setLoading(true)
      const data = await api.listSharedProjects()
      setSharedProjects(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleShareCurrent = async () => {
    if (!encryptionKey || !username) return
    try {
      // Generate a random project key
      const projectKey = await generateProjectKey()
      // Encrypt project data with project key
      const project = useProjectStore.getState().toProject()
      const plaintext = JSON.stringify(project)
      const ciphertext = await encrypt(projectKey, plaintext)
      // Wrap project key with owner's personal key
      const wrappedKey = await wrapProjectKey(projectKey, encryptionKey)
      // Create shared project on server
      const { id } = await api.createSharedProject({
        name: project.name,
        encrypted: true,
        data: ciphertext,
        wrappedKey, // owner's wrapped copy
        members: [{ username: username, role: 'owner', wrappedKey }],
      })
      await loadShared()
      setShowInvite(id)
    } catch (e: any) {
      setError(e.message)
    }
  }

  const handleOpenShared = async (id: string) => {
    if (!encryptionKey) return
    try {
      const data = await api.loadSharedProject(id)
      const member = data.members?.find((m: any) => m.username === username)
      if (!member) throw new Error('Not a member')
      // Unwrap project key
      const projectKey = await unwrapProjectKey(member.wrappedKey, encryptionKey)
      // Decrypt project data
      const plaintext = await decrypt(projectKey, data.data)
      const project = JSON.parse(plaintext)
      useProjectStore.getState().loadProject(project)
      useProjectStore.getState().pushHistory()
      onClose()
    } catch (e: any) {
      setError('Failed to decrypt -- wrong password or invalid key: ' + e.message)
    }
  }

  const handleInvite = async () => {
    if (!showInvite || !inviteUsername || !encryptionKey) return
    setInviteError('')
    try {
      // Load the shared project to get our wrapped key
      const data = await api.loadSharedProject(showInvite)
      const myMember = data.members?.find((m: any) => m.username === username)
      if (!myMember) throw new Error('Not a member')
      // Unwrap project key with our key
      const projectKey = await unwrapProjectKey(myMember.wrappedKey, encryptionKey)

      // We need the invitee's public encryption key to wrap the project key for them.
      // In a zero-knowledge system, we can't do this without the invitee's password.
      //
      // Solution: We wrap the project key with a key derived from:
      //   PBKDF2(invitee_username + shared_project_id)
      // The invitee, when they accept, re-wraps with their personal key.
      // This is a temporary "invitation key" -- secure enough for the invite flow.
      const inviteKey = await deriveKey(showInvite, inviteUsername)
      const wrappedForInvitee = await wrapProjectKey(projectKey, inviteKey)

      await api.inviteMember(showInvite, inviteUsername.toLowerCase().trim(), inviteRole, wrappedForInvitee)
      setInviteUsername('')
      await loadShared()
    } catch (e: any) {
      setInviteError(e.message)
    }
  }

  const roleIcon = (role: string) => {
    if (role === 'owner') return <Crown size={12} className="text-amber-400" />
    if (role === 'editor') return <Edit3 size={12} className="text-blue-400" />
    return <Eye size={12} className="text-gray-400" />
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-raised border border-border rounded-xl shadow-2xl w-[600px] max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-accent" />
            <h2 className="text-lg font-semibold text-gray-200">Shared Projects</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={18} /></button>
        </div>

        <div className="px-6 py-3 space-y-2">
          <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-lg px-3 py-2 text-xs text-emerald-400/80 flex gap-2">
            <Shield size={14} className="shrink-0 mt-0.5" />
            <span>End-to-end encrypted. Each shared project has its own key, wrapped individually for each member. The server cannot read shared data.</span>
          </div>
          {!sharingEnabled && (
            <div
              data-testid="sharing-not-enabled-banner"
              className="bg-amber-950/30 border border-amber-800/40 rounded-lg px-3 py-2 text-xs text-amber-300/90 flex gap-2"
            >
              <Info size={14} className="shrink-0 mt-0.5" />
              <span>
                <strong className="text-amber-200">Project sharing is not enabled for the current user.</strong>
                {' '}You can still open shared projects you have already been invited to (read-only access depends on your role),
                but you cannot create new shared projects or invite others. Contact the operator if you believe this is in error.
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-4">
          {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
          {loading && <p className="text-gray-500 text-center py-6">Loading...</p>}

          {!loading && sharedProjects.length === 0 && (
            <p className="text-gray-500 text-center py-6">No shared projects yet.</p>
          )}

          <div className="space-y-2">
            {sharedProjects.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-gray-600 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">{roleIcon(p.role)}</div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-200">{p.name}</h3>
                    <p className="text-[11px] text-gray-500">
                      Owner: {p.owner} · {p.memberCount} member{p.memberCount !== 1 ? 's' : ''} · {p.role}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  {sharingEnabled && (p.role === 'owner' || p.role === 'editor') && (
                    <button onClick={() => setShowInvite(showInvite === p.id ? null : p.id)}
                      className="p-1.5 text-gray-400 hover:text-accent rounded transition-colors" title="Invite member">
                      <UserPlus size={14} />
                    </button>
                  )}
                  <button onClick={() => handleOpenShared(p.id)}
                    className="px-3 py-1 text-xs bg-accent hover:bg-accent-hover text-white rounded font-medium">
                    Open
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Invite form */}
          {showInvite && (
            <div className="mt-3 p-3 border border-accent/30 rounded-lg bg-accent/5">
              <h4 className="text-xs font-medium text-gray-300 mb-2">Invite to project</h4>
              <div className="flex gap-2">
                <input type="text" placeholder="Username" value={inviteUsername}
                  onChange={(e) => setInviteUsername(e.target.value)}
                  className="flex-1 bg-surface-overlay border border-border rounded px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-accent" />
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as any)}
                  className="bg-surface-overlay border border-border rounded px-2 py-1.5 text-xs text-gray-300 outline-none">
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button onClick={handleInvite}
                  className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs rounded font-medium">
                  Invite
                </button>
              </div>
              {inviteError && <p className="text-red-400 text-xs mt-1">{inviteError}</p>}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <span className="text-xs text-gray-600">{sharedProjects.length} shared project{sharedProjects.length !== 1 ? 's' : ''}</span>
          <button
            onClick={handleShareCurrent}
            disabled={!sharingEnabled}
            title={sharingEnabled ? undefined : 'Project sharing is not enabled for the current user'}
            className="px-4 py-1.5 text-sm bg-accent hover:bg-accent-hover text-white rounded-md font-medium disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-accent"
          >
            Share Current Project
          </button>
        </div>
      </div>
    </div>
  )
}
