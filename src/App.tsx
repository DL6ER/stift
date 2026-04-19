// Application root. Wires the four panel regions (Toolbar, TopBar,
// PropertyPanel, StatusBar) around the EditorCanvas, owns the global
// keyboard shortcut handler, and runs the autosave recovery prompt
// on first mount. Almost all real state lives in the two zustand
// stores; App.tsx is mostly composition + keybinds.

import { useEffect, useCallback, useState } from 'react'
import { Toolbar } from './panels/Toolbar'
import { PropertyPanel } from './panels/PropertyPanel'
import { StatusBar } from './panels/StatusBar'
import { EditorCanvas } from './canvas/EditorCanvas'
import { TopBar } from './panels/TopBar'
import { useEditorStore } from './stores/editorStore'
import { useProjectStore } from './stores/projectStore'
import { ToolType, Annotation } from './types'
import { useClipboardPaste } from './lib/clipboard'
import { WelcomeOverlay } from './components/WelcomeOverlay'
import { ContextMenu } from './components/ContextMenu'
import { ShortcutPanel } from './components/ShortcutPanel'
import { InviteHandler } from './components/InviteHandler'
import { useConfigStore } from './stores/configStore'
import { startAutosave, getAutosave, clearAutosave } from './lib/autosave'

const TOOL_SHORTCUTS: Record<string, ToolType> = {
  v: 'select',
  a: 'arrow',
  t: 'text',
  g: 'textbox',
  h: 'highlight',
  b: 'blur',
  r: 'rectangle',
  e: 'ellipse',
  l: 'line',
  d: 'draw',
  x: 'colorbox',
  n: 'counter',
  m: 'dimension',
  w: 'stamp',
  k: 'connector',
  i: 'eyedropper',
  z: 'magnifier',
}

export default function App() {
  const setActiveTool = useEditorStore((s) => s.setActiveTool)
  const undo = useProjectStore((s) => s.undo)
  const redo = useProjectStore((s) => s.redo)
  const removeAnnotation = useProjectStore((s) => s.removeAnnotation)
  const removeImage = useProjectStore((s) => s.removeImage)
  const selectedIds = useEditorStore((s) => s.selectedIds)
  const setSelectedIds = useEditorStore((s) => s.setSelectedIds)
  const pushHistory = useProjectStore((s) => s.pushHistory)

  const fetchConfig = useConfigStore((s) => s.fetchConfig)

  const [toast, setToast] = useState<string | null>(null)
  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 1200)
  }, [])

  useClipboardPaste()

  // Auto-save and recovery
  useEffect(() => {
    startAutosave()
    const saved = getAutosave()
    if (saved && saved.project.annotations?.length > 0) {
      const age = Date.now() - new Date(saved.time).getTime()
      if (age < 86400000) { // less than 24 hours old
        const restore = confirm(`Unsaved work found from ${new Date(saved.time).toLocaleString()}.\n\nRestore it?`)
        if (restore) {
          useProjectStore.getState().loadProject(saved.project)
          useProjectStore.getState().pushHistory()
        }
        clearAutosave()
      }
    }
  }, [])

  useEffect(() => {
    fetchConfig()
  }, [fetchConfig])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't capture when typing in input fields
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      // Ctrl+= / Ctrl+- -- zoom in/out, Ctrl+0 -- zoom 100%
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        const z = useEditorStore.getState().zoom
        useEditorStore.getState().setZoom(Math.min(10, z * 1.2))
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault()
        const z = useEditorStore.getState().zoom
        useEditorStore.getState().setZoom(Math.max(0.1, z / 1.2))
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault()
        useEditorStore.getState().setZoom(1)
        useEditorStore.getState().setStagePos({ x: 0, y: 0 })
        return
      }

      // Ctrl+S -- save locally
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        const project = useProjectStore.getState().toProject()
        const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${project.name}.stift`
        a.click()
        URL.revokeObjectURL(url)
        return
      }

      // Undo/Redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
        showToast('Undo')
        return
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
        showToast('Redo')
        return
      }

      // Ctrl+C -- copy selected to internal clipboard
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedIds.length > 0) {
        const store = useProjectStore.getState()
        const copied = selectedIds
          .map((id) => store.annotations.find((a) => a.id === id))
          .filter(Boolean) as Annotation[]
        if (copied.length > 0) {
          useEditorStore.getState().setClipboard(copied.map((a) => ({ ...a })))
        }
        return
      }

      // Ctrl+V -- paste from internal clipboard
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        const clip = useEditorStore.getState().clipboard
        if (clip.length > 0) {
          e.preventDefault()
          pushHistory()
          const newIds: string[] = []
          for (const ann of clip) {
            const newId = crypto.randomUUID()
            useProjectStore.getState().addAnnotation({ ...ann, id: newId, x: ann.x + 20, y: ann.y + 20 })
            newIds.push(newId)
          }
          setSelectedIds(newIds)
          return
        }
        // If no internal clipboard, let browser handle paste (image paste)
        return
      }

      // Ctrl+D -- duplicate selected
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault()
        if (selectedIds.length > 0) {
          const store = useProjectStore.getState()
          pushHistory()
          for (const id of selectedIds) {
            const ann = store.annotations.find((a) => a.id === id)
            if (ann) {
              store.addAnnotation({ ...ann, id: crypto.randomUUID(), x: ann.x + 20, y: ann.y + 20 })
            }
          }
        }
        return
      }

      // Ctrl+G -- group selected, Ctrl+Shift+G -- ungroup
      if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
        e.preventDefault()
        if (selectedIds.length > 1 && !e.shiftKey) {
          pushHistory()
          useProjectStore.getState().groupAnnotations(selectedIds)
        } else if (e.shiftKey && selectedIds.length > 0) {
          pushHistory()
          useProjectStore.getState().ungroupAnnotations(selectedIds)
        }
        return
      }

      // Layer ordering: ] forward, [ backward, Shift+] front, Shift+[ back
      if (e.key === ']' && selectedIds.length === 1) {
        e.preventDefault()
        pushHistory()
        if (e.shiftKey) useProjectStore.getState().moveAnnotationToFront(selectedIds[0])
        else useProjectStore.getState().moveAnnotationForward(selectedIds[0])
        return
      }
      if (e.key === '[' && selectedIds.length === 1) {
        e.preventDefault()
        pushHistory()
        if (e.shiftKey) useProjectStore.getState().moveAnnotationToBack(selectedIds[0])
        else useProjectStore.getState().moveAnnotationBackward(selectedIds[0])
        return
      }

      // Ctrl+A -- select all annotations
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault()
        const allIds = useProjectStore.getState().annotations.map((a) => a.id)
        setSelectedIds(allIds)
        return
      }

      // Arrow keys -- nudge selected elements
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && selectedIds.length > 0) {
        e.preventDefault()
        const delta = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -delta : e.key === 'ArrowRight' ? delta : 0
        const dy = e.key === 'ArrowUp' ? -delta : e.key === 'ArrowDown' ? delta : 0
        const store = useProjectStore.getState()
        pushHistory()
        for (const id of selectedIds) {
          const ann = store.annotations.find((a) => a.id === id)
          if (ann) {
            if ('points' in ann) {
              const pts = [...(ann as any).points] as number[]
              for (let i = 0; i < pts.length; i += 2) { pts[i] += dx; pts[i + 1] += dy }
              store.updateAnnotation(id, { points: pts } as any)
            } else {
              store.updateAnnotation(id, { x: ann.x + dx, y: ann.y + dy })
            }
          }
          const img = store.images.find((i) => i.id === id)
          if (img && !img.locked) {
            store.updateImage(id, { x: img.x + dx, y: img.y + dy })
          }
        }
        return
      }

      // Escape -- deselect, exit crop mode, switch to select tool
      if (e.key === 'Escape') {
        e.preventDefault()
        setSelectedIds([])
        setActiveTool('select')
        useEditorStore.getState().setCroppingImageId(null)
        return
      }

      // Delete
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.length > 0) {
          e.preventDefault()
          pushHistory()
          const store = useProjectStore.getState()
          selectedIds.forEach((id) => {
            removeAnnotation(id)
            removeImage(id)
            store.removeConnector(id)
            store.removeROI(id)
          })
          setSelectedIds([])
        }
        return
      }

      // Tool shortcuts (only when no modifier keys)
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const tool = TOOL_SHORTCUTS[e.key.toLowerCase()]
        if (tool) {
          e.preventDefault()
          setActiveTool(tool)
        }
      }
    },
    [setActiveTool, setSelectedIds, undo, redo, selectedIds, removeAnnotation, removeImage, pushHistory],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Drag-and-drop .stift project files
  useEffect(() => {
    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      const file = e.dataTransfer?.files[0]
      if (!file || !file.name.endsWith('.stift')) return
      file.text().then((text) => {
        const project = JSON.parse(text)
        useProjectStore.getState().loadProject(project)
        useProjectStore.getState().pushHistory()
      }).catch(() => {})
    }
    const prevent = (e: DragEvent) => e.preventDefault()
    window.addEventListener('drop', handleDrop)
    window.addEventListener('dragover', prevent)
    return () => { window.removeEventListener('drop', handleDrop); window.removeEventListener('dragover', prevent) }
  }, [])

  // Ctrl+P print
  useEffect(() => {
    const handleBeforePrint = () => {
      useEditorStore.getState().setSelectedIds([])
    }
    window.addEventListener('beforeprint', handleBeforePrint)
    return () => window.removeEventListener('beforeprint', handleBeforePrint)
  }, [])

  // Warn before closing with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (useProjectStore.getState().isDirty) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  return (
    <div className="flex flex-col h-screen w-screen bg-surface">
      {__STIFT_DEV__ && (
        <div className="bg-amber-600 text-black text-xs text-center py-1 font-medium shrink-0">
          DEVELOPMENT BUILD -- unminified, not for production use
        </div>
      )}
      <WelcomeOverlay />
      <InviteHandler />
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-surface-raised border border-border rounded-lg px-4 py-2 text-sm text-gray-300 shadow-lg pointer-events-none animate-fade-in">
          {toast}
        </div>
      )}
      <ContextMenu />
      <ShortcutPanel />
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Toolbar />
        <div className="flex-1 relative">
          <EditorCanvas />
        </div>
        <PropertyPanel />
      </div>
      <StatusBar />
    </div>
  )
}
