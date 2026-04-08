// Top toolbar: file ops (new / open / save / export), undo / redo,
// zoom controls, and the auth + sharing entry points. The export
// menu owns the PNG / JPG / PDF / LaTeX dropdown; everything else is
// a plain icon button. Server-side save/load is gated on a logged-in
// user and dispatches into ServerExplorer.

import { useCallback, useRef, useState } from 'react'
import {
  FilePlus, FolderOpen, Save, Undo2, Redo2, Grid, ZoomIn, ZoomOut, HelpCircle,
  Download, Copy, Magnet, ImagePlus, HardDrive, FileDown, FileUp, Users,
} from 'lucide-react'
import { useProjectStore } from '../stores/projectStore'
import { useEditorStore } from '../stores/editorStore'
import { loadImageFromFile } from '../lib/clipboard'
import { exportPNG, exportJPG, exportPDF, exportLaTeX } from '../lib/exportImage'
import { ServerExplorer } from '../components/ServerExplorer'
import { useAuthStore } from '../stores/authStore'
import { AuthDialog } from '../components/AuthDialog'
import { ShareDialog } from '../components/ShareDialog'
import * as api from '../lib/api'

export function TopBar() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const projectName = useProjectStore((s) => s.projectName)
  const setProjectMeta = useProjectStore((s) => s.setProjectMeta)
  const canvasWidth = useProjectStore((s) => s.canvasWidth)
  const canvasHeight = useProjectStore((s) => s.canvasHeight)
  const undo = useProjectStore((s) => s.undo)
  const redo = useProjectStore((s) => s.redo)
  const pushHistory = useProjectStore((s) => s.pushHistory)
  const addImage = useProjectStore((s) => s.addImage)
  const addAnnotation = useProjectStore((s) => s.addAnnotation)
  const toProject = useProjectStore((s) => s.toProject)
  const loadProject = useProjectStore((s) => s.loadProject)
  const clearProject = useProjectStore((s) => s.clearProject)
  const projectId = useProjectStore((s) => s.projectId)
  const setProjectId = useProjectStore((s) => s.setProjectId)
  const historyIndex = useProjectStore((s) => s.historyIndex)
  const historyLength = useProjectStore((s) => s.history.length)
  const images = useProjectStore((s) => s.images)
  const annotations = useProjectStore((s) => s.annotations)

  const zoom = useEditorStore((s) => s.zoom)
  const setZoom = useEditorStore((s) => s.setZoom)
  const showGrid = useEditorStore((s) => s.showGrid)
  const toggleGrid = useEditorStore((s) => s.toggleGrid)
  const snapToGrid = useEditorStore((s) => s.snapToGrid)
  const toggleSnap = useEditorStore((s) => s.toggleSnap)
  const selectedIds = useEditorStore((s) => s.selectedIds)

  const [showFileMenu, setShowFileMenu] = useState(false)
  const [showExplorer, setShowExplorer] = useState<'open' | 'save' | null>(null)
  const [showAuth, setShowAuth] = useState(false)
  const [pendingAction, setPendingAction] = useState<'open' | 'save' | null>(null)
  const [showShare, setShowShare] = useState(false)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const authUsername = useAuthStore((s) => s.username)
  const logout = useAuthStore((s) => s.logout)

  const handleNewProject = () => {
    if (!confirm('Create new project? Unsaved changes will be lost.')) return
    clearProject()
    pushHistory()
    setShowFileMenu(false)
  }

  const handleAddImage = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue
      const imgData = await loadImageFromFile(file)
      pushHistory()
      let w = imgData.width
      let h = imgData.height
      const maxW = canvasWidth * 0.8
      const maxH = canvasHeight * 0.8
      if (w > maxW || h > maxH) {
        const scale = Math.min(maxW / w, maxH / h)
        w = Math.round(w * scale)
        h = Math.round(h * scale)
      }
      addImage({
        data: imgData.data,
        name: imgData.name,
        x: Math.round((canvasWidth - w) / 2),
        y: Math.round((canvasHeight - h) / 2),
        width: w,
        height: h,
        naturalWidth: imgData.width,
        naturalHeight: imgData.height,
        role: 'standalone',
      })
    }
    e.target.value = ''
  }

  const downloadProjectFile = (project: any) => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project.name}.stift`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleSave = async () => {
    const project = toProject()
    setShowFileMenu(false)

    if (!projectId) {
      const confirmed = confirm(
        'SAVE TO SERVER\n\n' +
        'This will send your project data (including all images) to the server and store it on disk.\n\n' +
        'Only use this if you trust the server operator.\n' +
        'Alternatively, use Export to download files directly to your machine without any server involvement.\n\n' +
        'Continue with server save?'
      )
      if (!confirmed) {
        downloadProjectFile(project)
        return
      }
    }

    try {
      if (projectId) {
        await api.saveProject(projectId, project)
      } else {
        const { id } = await api.createProject(project)
        setProjectId(id)
      }
    } catch {
      downloadProjectFile(project)
    }
  }

  const handleDownloadLocal = () => {
    const project = toProject()
    downloadProjectFile(project)
    useProjectStore.getState().markClean()
    addRecentProject(project.name)
    setShowFileMenu(false)
  }

  const addRecentProject = (name: string) => {
    try {
      const recent = JSON.parse(localStorage.getItem('stift-recent') || '[]') as string[]
      const updated = [name, ...recent.filter((n) => n !== name)].slice(0, 5)
      localStorage.setItem('stift-recent', JSON.stringify(updated))
    } catch {}
  }

  const openFromLocalFile = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.stift,.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const text = await file.text()
      const project = JSON.parse(text)
      loadProject(project)
      pushHistory()
    }
    input.click()
  }

  const handleOpen = async () => {
    setShowFileMenu(false)

    try {
      const projects = await api.listProjects()
      if (projects.length === 0) {
        openFromLocalFile()
        return
      }
      const name = prompt(
        'Enter project name to open (or cancel to open a local file):\n\n' +
        projects.map((p) => `  ${p.name} (${p.id})`).join('\n')
      )
      if (!name) {
        openFromLocalFile()
        return
      }
      const match = projects.find((p) => p.name === name || p.id === name)
      if (!match) { alert('Project not found.'); return }
      const project = await api.loadProject(match.id)
      loadProject(project, match.id)
      pushHistory()
    } catch {
      openFromLocalFile()
    }
  }

  const prepareExport = async () => {
    const stage = (window as any).__stift_stage
    if (!stage) return null
    useEditorStore.getState().setSelectedIds([])
    const transformer = stage.findOne('Transformer')
    if (transformer) transformer.nodes([])
    stage.batchDraw()
    await new Promise((r) => setTimeout(r, 50))
    return stage
  }

  const handleExport = (format: 'png' | 'png1x' | 'jpg' | 'jpg1x' | 'pdf' | 'pdf-a4' | 'pdf-letter' | 'latex') => async () => {
    setShowFileMenu(false)
    const stage = await prepareExport()
    if (!stage) return
    switch (format) {
      case 'png': exportPNG(stage, canvasWidth, canvasHeight, projectName); break
      case 'png1x': exportPNG(stage, canvasWidth, canvasHeight, projectName, 1); break
      case 'jpg': exportJPG(stage, canvasWidth, canvasHeight, projectName, 2, 0.92); break
      case 'jpg1x': exportJPG(stage, canvasWidth, canvasHeight, projectName, 1, 0.8); break
      case 'pdf': exportPDF(stage, canvasWidth, canvasHeight, projectName, 'canvas'); break
      case 'pdf-a4': exportPDF(stage, canvasWidth, canvasHeight, projectName, 'a4'); break
      case 'pdf-letter': exportPDF(stage, canvasWidth, canvasHeight, projectName, 'letter'); break
      case 'latex': exportLaTeX(stage, canvasWidth, canvasHeight, projectName, useProjectStore.getState()); break
    }
  }

  const handleDuplicate = () => {
    if (selectedIds.length === 0) return
    pushHistory()
    const store = useProjectStore.getState()
    for (const id of selectedIds) {
      const ann = store.annotations.find((a) => a.id === id)
      if (ann) {
        const clone = { ...ann, id: crypto.randomUUID(), x: ann.x + 20, y: ann.y + 20 }
        addAnnotation(clone)
      }
    }
  }

  return (
    <div className="h-11 bg-surface-raised border-b border-border flex items-center px-3 gap-1 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-3">
        <img src="/stift.svg" alt="" className="w-6 h-6" />
        <span className="font-semibold text-sm text-gray-200">Stift</span>
      </div>

      {/* File menu dropdown */}
      {/* File menu -- click to toggle, click outside to close */}
      <div className="relative">
        <button
          onClick={() => setShowFileMenu(!showFileMenu)}
          className={`text-xs px-2.5 py-1.5 rounded transition-colors ${showFileMenu ? 'bg-surface-overlay text-white' : 'text-gray-300 hover:bg-surface-overlay'}`}
        >
          File ▾
        </button>
        {showFileMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowFileMenu(false)} />
            <div className="absolute left-0 top-full bg-surface-overlay border border-border rounded-md shadow-xl z-50 min-w-[240px]">
              <MenuItem icon={FilePlus} label="New Project" onClick={handleNewProject} />
              <div className="h-px bg-border mx-2 my-0.5" />

              {/* Local file operations -- always visible */}
              <div className="px-3 py-1 text-[10px] text-gray-500 uppercase tracking-wider">Local</div>
              <MenuItem icon={FileUp} label="Open from Disk..." onClick={() => { openFromLocalFile(); setShowFileMenu(false) }} indent />
              <MenuItem icon={FileDown} label="Save to Disk" shortcut="Ctrl+S" onClick={handleDownloadLocal} indent />

              <div className="h-px bg-border mx-2 my-0.5" />
              <div className="px-3 py-1 text-[10px] text-gray-500 uppercase tracking-wider">
                Server {isAuthenticated && <span className="text-emerald-500 normal-case">({authUsername})</span>}
              </div>
              {isAuthenticated ? (
                <>
                  <MenuItem icon={FolderOpen} label="Open from Server..." onClick={() => { setShowExplorer('open'); setShowFileMenu(false) }} indent />
                  <MenuItem icon={HardDrive} label="Save to Server..." onClick={() => { setShowExplorer('save'); setShowFileMenu(false) }} indent />
                  <MenuItem icon={Users} label="Shared Projects..." onClick={() => { setShowShare(true); setShowFileMenu(false) }} indent />
                  <MenuItem label="Sign out" onClick={() => { logout(); setShowFileMenu(false) }} indent />
                </>
              ) : (
                <MenuItem icon={HardDrive} label="Sign in to access server..." onClick={() => {
                  setShowFileMenu(false)
                  setShowAuth(true)
                }} indent />
              )}

              <div className="h-px bg-border mx-2 my-0.5" />
              <MenuItem icon={Save} label="Save Version" onClick={() => { useProjectStore.getState().saveVersion(); setShowFileMenu(false) }} />

              <div className="h-px bg-border mx-2 my-0.5" />
              <div className="px-3 py-1 text-[10px] text-gray-500 uppercase tracking-wider">Export</div>
              <MenuItem label="PNG (2x)" onClick={handleExport('png')} indent />
              <MenuItem label="PNG (1x)" onClick={handleExport('png1x')} indent />
              <MenuItem label="JPG (2x, high)" onClick={handleExport('jpg')} indent />
              <MenuItem label="JPG (1x, medium)" onClick={handleExport('jpg1x')} indent />
              <MenuItem label="PDF (canvas size)" onClick={handleExport('pdf')} indent />
              <MenuItem label="PDF (A4)" onClick={handleExport('pdf-a4')} indent />
              <MenuItem label="PDF (Letter)" onClick={handleExport('pdf-letter')} indent />
              <MenuItem label="LaTeX (.tex + .png)" onClick={handleExport('latex')} indent />

              {useProjectStore.getState().versions.length > 0 && (
                <>
                  <div className="h-px bg-border mx-2 my-0.5" />
                  <div className="px-3 py-1 text-[10px] text-gray-500 uppercase tracking-wider">Versions</div>
                  {useProjectStore.getState().versions.map((v, i) => (
                    <MenuItem key={i} label={`${v.name} -- ${new Date(v.timestamp).toLocaleTimeString()}`}
                      onClick={() => { useProjectStore.getState().restoreVersion(i); setShowFileMenu(false) }} indent />
                  ))}
                </>
              )}
            </div>
          </>
        )}
      </div>

      <button
        onClick={handleAddImage}
        className="text-xs px-2 py-1.5 rounded text-gray-300 hover:bg-surface-overlay transition-colors flex items-center gap-1"
        title="Add Image"
      >
        <ImagePlus size={14} />
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      <div className="w-px h-6 bg-border mx-1" />

      {/* Undo/Redo */}
      <ToolButton icon={Undo2} label="Undo (Ctrl+Z)" onClick={undo} disabled={historyIndex <= 0} />
      <ToolButton icon={Redo2} label="Redo (Ctrl+Y)" onClick={redo} disabled={historyIndex >= historyLength - 1} />

      <div className="w-px h-6 bg-border mx-1" />

      {/* Duplicate */}
      <ToolButton icon={Copy} label="Duplicate (Ctrl+D)" onClick={handleDuplicate} disabled={selectedIds.length === 0} />


      <div className="w-px h-6 bg-border mx-1" />

      {/* Zoom */}
      <ToolButton icon={ZoomOut} label="Zoom Out" onClick={() => setZoom(Math.max(0.1, zoom / 1.2))} />
      <span className="text-xs text-gray-400 w-12 text-center">{Math.round(zoom * 100)}%</span>
      <ToolButton icon={ZoomIn} label="Zoom In" onClick={() => setZoom(Math.min(10, zoom * 1.2))} />

      <ToolButton
        icon={Grid}
        label="Toggle Grid"
        onClick={toggleGrid}
        active={showGrid}
      />
      <ToolButton
        icon={Magnet}
        label="Snap to Grid"
        onClick={toggleSnap}
        active={snapToGrid}
      />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Project name */}
      <input
        type="text"
        value={projectName}
        onChange={(e) => setProjectMeta(e.target.value, canvasWidth, canvasHeight)}
        className="bg-transparent text-sm text-gray-300 border border-transparent hover:border-border focus:border-accent rounded px-2 py-1 text-right w-48 outline-none"
      />

      {/* Help */}
      <button
        onClick={() => {
          const hasWork = useProjectStore.getState().annotations.length > 0 || useProjectStore.getState().images.length > 0
          if (hasWork) {
            const confirmed = confirm(
              'Showing the onboarding will reload the page and discard your current work.\n\nThis cannot be undone. Make sure to export first if needed.\n\nContinue?'
            )
            if (!confirmed) return
          }
          localStorage.removeItem('stift-onboarding-seen')
          window.location.reload()
        }}
        className="w-8 h-8 flex items-center justify-center rounded text-gray-500 hover:bg-surface-overlay hover:text-gray-200 transition-colors"
        title="Show onboarding guide"
      >
        <HelpCircle size={16} />
      </button>

      {showExplorer && <ServerExplorer mode={showExplorer} onClose={() => setShowExplorer(null)} />}
      {showShare && <ShareDialog onClose={() => setShowShare(false)} />}
      {showAuth && <AuthDialog onClose={() => { setShowAuth(false); setPendingAction(null) }}
        onSuccess={() => { setShowAuth(false); if (pendingAction) { setShowExplorer(pendingAction); setPendingAction(null) } }} />}
    </div>
  )
}

function ToolButton({
  icon: Icon, label, onClick, disabled, active,
}: {
  icon: React.ElementType; label: string; onClick: () => void; disabled?: boolean; active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        w-8 h-8 flex items-center justify-center rounded transition-colors
        ${active ? 'bg-accent text-white' : 'text-gray-400 hover:bg-surface-overlay hover:text-gray-200'}
        ${disabled ? 'opacity-30 cursor-not-allowed' : ''}
      `}
      title={label}
    >
      <Icon size={16} />
    </button>
  )
}

function MenuItem({ icon: Icon, label, shortcut, onClick, indent }: {
  icon?: React.ElementType; label: string; shortcut?: string; onClick: () => void; indent?: boolean
}) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm text-gray-200 hover:bg-surface-raised ${indent ? 'pl-6' : ''}`}>
      {Icon && <Icon size={14} />}
      <span className="flex-1">{label}</span>
      {shortcut && <span className="text-[10px] text-gray-500">{shortcut}</span>}
    </button>
  )
}
