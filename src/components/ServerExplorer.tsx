// Server-side project browser for personal (non-shared) projects.
// Handles the compress -> encrypt -> upload pipeline on save and the
// inverse on load. The server only ever sees the final ciphertext
// blob, so compression has to finish before encryption (the opposite
// order would defeat compression -- ciphertext is effectively random).
// Shared projects live in ShareDialog, not here.

import { useState, useEffect } from 'react'
import { X, Trash2, FolderOpen, Save, Clock, Image, Layers, HardDrive, Shield, Lock } from 'lucide-react'
import { useProjectStore } from '../stores/projectStore'
import { useAuthStore } from '../stores/authStore'
import { encrypt, decrypt } from '../lib/crypto'
import { compressProjectForServer } from '../lib/imageCompress'
import { useConfigStore } from '../stores/configStore'
import { AuthDialog } from './AuthDialog'
import * as api from '../lib/api'

interface ServerProject {
  id: string
  name: string
  updatedAt: string
  imageCount: number
  annotationCount: number
  canvasWidth: number
  canvasHeight: number
  sizeKB: number
  thumbnail: string | null
}

interface Props {
  mode: 'open' | 'save'
  onClose: () => void
}

export function ServerExplorer({ mode, onClose }: Props) {
  const [projects, setProjects] = useState<ServerProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showAuth, setShowAuth] = useState(false)
  const projectName = useProjectStore((s) => s.projectName)
  const projectId = useProjectStore((s) => s.projectId)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const encryptionKey = useAuthStore((s) => s.encryptionKey)
  const username = useAuthStore((s) => s.username)
  const logout = useAuthStore((s) => s.logout)
  const compressUploads = useConfigStore((s) => s.compressUploads)

  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = async () => {
    try {
      setLoading(true)
      const data = await api.listProjects() as unknown as ServerProject[]
      setProjects(data)
      setError(null)
    } catch (e) {
      setError('Failed to connect to server')
    } finally {
      setLoading(false)
    }
  }

  const handleOpen = async (id: string) => {
    try {
      const raw = await api.loadProject(id)
      let project = raw
      // Decrypt if encrypted
      if (encryptionKey && (raw as any).encrypted) {
        const plaintext = await decrypt(encryptionKey, (raw as any).data)
        project = JSON.parse(plaintext)
      }
      useProjectStore.getState().loadProject(project, id)
      useProjectStore.getState().pushHistory()
      useProjectStore.getState().markClean()
      onClose()
    } catch (e) {
      setError('Failed to load/decrypt project. Wrong password?')
    }
  }

  const encryptAndSave = async (id: string | null) => {
    try {
      const rawProject = useProjectStore.getState().toProject()
      // Compress images for server storage (if enabled)
      let project = rawProject
      if (compressUploads) {
        const { project: compressed } = await compressProjectForServer(rawProject)
        project = compressed
      }
      let payload: any = project

      // Encrypt if authenticated
      if (encryptionKey) {
        const plaintext = JSON.stringify(project)
        const ciphertext = await encrypt(encryptionKey, plaintext)
        payload = {
          encrypted: true,
          owner: username,
          name: project.name,
          updatedAt: new Date().toISOString(),
          data: ciphertext,
        }
      }

      if (id) {
        await api.saveProject(id, payload)
        useProjectStore.getState().setProjectId(id)
      } else {
        const { id: newId } = await api.createProject(payload)
        useProjectStore.getState().setProjectId(newId)
      }
      useProjectStore.getState().markClean()
      onClose()
    } catch {
      setError('Failed to save project')
    }
  }

  const handleSave = () => encryptAndSave(projectId)
  const handleSaveAs = (existingId: string) => encryptAndSave(existingId)

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this project from the server? This cannot be undone.')) return
    try {
      await api.deleteProject(id)
      setProjects((prev) => prev.filter((p) => p.id !== id))
      if (selectedId === id) setSelectedId(null)
    } catch {
      setError('Failed to delete project')
    }
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-raised border border-border rounded-xl shadow-2xl w-[700px] max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-border">
          <div className="flex items-center gap-3">
            <HardDrive size={20} className="text-accent" />
            <h2 className="text-lg font-semibold text-gray-200">
              {mode === 'open' ? 'Open from Server' : 'Save to Server'}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={18} /></button>
        </div>

        {/* Auth & Encryption status */}
        <div className="px-6 pb-3">
          {isAuthenticated ? (
            <div className="flex items-center justify-between bg-emerald-950/30 border border-emerald-800/40 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <Shield size={14} />
                <span>End-to-end encrypted as <strong>{username}</strong></span>
              </div>
              <button onClick={() => { logout(); loadProjects() }} className="text-xs text-gray-500 hover:text-gray-300">Sign out</button>
            </div>
          ) : (
            <div className="flex items-center justify-between bg-amber-950/30 border border-amber-800/40 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-amber-400">
                <Lock size={14} />
                <span>Not encrypted -- sign in to enable E2E encryption</span>
              </div>
              <button onClick={() => setShowAuth(true)} className="text-xs px-3 py-1 bg-accent hover:bg-accent-hover text-white rounded font-medium">Sign in</button>
            </div>
          )}
        </div>

        {showAuth && <AuthDialog onClose={() => setShowAuth(false)} onSuccess={() => { setShowAuth(false); loadProjects() }} />}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && <p className="text-gray-500 text-center py-8">Loading projects...</p>}
          {error && <p className="text-red-400 text-center py-4">{error}</p>}

          {!loading && projects.length === 0 && (
            <p className="text-gray-500 text-center py-8">No projects on server yet.</p>
          )}

          <div className="space-y-2">
            {projects.map((p) => (
              <div
                key={p.id}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedId === p.id ? 'border-accent bg-accent/10' : 'border-border hover:border-gray-600 hover:bg-surface-overlay'
                }`}
                onClick={() => setSelectedId(p.id)}
                onDoubleClick={() => mode === 'open' ? handleOpen(p.id) : handleSaveAs(p.id)}
              >
                {/* Thumbnail */}
                <div className="w-16 h-12 rounded bg-surface-overlay border border-border flex items-center justify-center shrink-0 overflow-hidden">
                  {p.thumbnail ? (
                    <img src={p.thumbnail} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Image size={16} className="text-gray-600" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-gray-200 truncate">{p.name}</h3>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(p.id) }}
                      className="text-gray-600 hover:text-red-400 transition-colors p-1"
                      title="Delete project"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500">
                    <span className="flex items-center gap-1"><Clock size={10} />{formatDate(p.updatedAt)}</span>
                    <span className="flex items-center gap-1"><Image size={10} />{p.imageCount} img</span>
                    <span className="flex items-center gap-1"><Layers size={10} />{p.annotationCount} ann</span>
                    <span>{p.canvasWidth}x{p.canvasHeight}</span>
                    <span>{p.sizeKB} KB</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <div className="text-xs text-gray-600">
            <span>{projects.length} project{projects.length !== 1 ? 's' : ''}</span>
            {isAuthenticated && <span> · {projects.reduce((s, p) => s + p.sizeKB, 0)} KB used</span>}
            {mode === 'save' && compressUploads && <p className="text-[10px] text-gray-600 mt-0.5">Images auto-compressed (WebP, max 2048px). Save to Disk for full resolution.</p>}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
            {mode === 'open' && selectedId && (
              <button onClick={() => handleOpen(selectedId!)} className="px-5 py-1.5 text-sm bg-accent hover:bg-accent-hover text-white rounded-md font-medium">
                Open
              </button>
            )}
            {mode === 'save' && (
              <>
                {selectedId && (
                  <button onClick={() => handleSaveAs(selectedId!)} className="px-4 py-1.5 text-sm bg-surface-overlay hover:bg-surface-raised text-gray-300 rounded-md border border-border">
                    Overwrite Selected
                  </button>
                )}
                <button onClick={handleSave} className="px-5 py-1.5 text-sm bg-accent hover:bg-accent-hover text-white rounded-md font-medium">
                  {projectId ? 'Save' : 'Save as New'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
