import { useState, useEffect } from 'react'
import { useEditorStore } from '../stores/editorStore'
import { useProjectStore } from '../stores/projectStore'
import {
  alignLeft, alignRight, alignTop, alignBottom,
  alignCenterH, alignCenterV, distributeH, distributeV,
} from '../lib/align'

interface MenuPos { x: number; y: number }

export function ContextMenu() {
  const [pos, setPos] = useState<MenuPos | null>(null)
  const selectedIds = useEditorStore((s) => s.selectedIds)

  useEffect(() => {
    const handleContext = (e: MouseEvent) => {
      // Only show on canvas area
      const target = e.target as HTMLElement
      if (target.tagName === 'CANVAS' || target.closest('.bg-neutral-900')) {
        e.preventDefault()
        setPos({ x: e.clientX, y: e.clientY })
      }
    }
    const handleClick = () => setPos(null)
    window.addEventListener('contextmenu', handleContext)
    window.addEventListener('click', handleClick)
    return () => { window.removeEventListener('contextmenu', handleContext); window.removeEventListener('click', handleClick) }
  }, [])

  if (!pos) return null

  const hasSelection = selectedIds.length > 0
  const multiSelect = selectedIds.length > 1

  const action = (fn: () => void) => () => { fn(); setPos(null) }

  const copy = () => {
    const store = useProjectStore.getState()
    const copied = selectedIds.map((id) => store.annotations.find((a) => a.id === id)).filter(Boolean)
    if (copied.length > 0) useEditorStore.getState().setClipboard(copied.map((a) => ({ ...a! })))
  }

  const paste = () => {
    const clip = useEditorStore.getState().clipboard
    if (clip.length === 0) return
    useProjectStore.getState().pushHistory()
    const newIds: string[] = []
    for (const ann of clip) {
      const id = crypto.randomUUID()
      useProjectStore.getState().addAnnotation({ ...ann, id, x: ann.x + 20, y: ann.y + 20 })
      newIds.push(id)
    }
    useEditorStore.getState().setSelectedIds(newIds)
  }

  const duplicate = () => {
    if (!hasSelection) return
    useProjectStore.getState().pushHistory()
    const store = useProjectStore.getState()
    const newIds: string[] = []
    for (const id of selectedIds) {
      const ann = store.annotations.find((a) => a.id === id)
      if (ann) {
        const newId = crypto.randomUUID()
        store.addAnnotation({ ...ann, id: newId, x: ann.x + 20, y: ann.y + 20 })
        newIds.push(newId)
      }
    }
    useEditorStore.getState().setSelectedIds(newIds)
  }

  const del = () => {
    if (!hasSelection) return
    useProjectStore.getState().pushHistory()
    const store = useProjectStore.getState()
    for (const id of selectedIds) {
      store.removeAnnotation(id)
      store.removeImage(id)
      store.removeConnector(id)
      store.removeROI(id)
    }
    useEditorStore.getState().setSelectedIds([])
  }

  const toFront = () => { if (selectedIds.length === 1) { useProjectStore.getState().pushHistory(); useProjectStore.getState().moveAnnotationToFront(selectedIds[0]) } }
  const toBack = () => { if (selectedIds.length === 1) { useProjectStore.getState().pushHistory(); useProjectStore.getState().moveAnnotationToBack(selectedIds[0]) } }

  return (
    <div
      className="fixed z-[100] bg-surface-overlay border border-border rounded-lg shadow-xl py-1 min-w-[180px]"
      style={{ left: pos.x, top: pos.y }}
    >
      {hasSelection && (
        <>
          <Item label="Copy" shortcut="Ctrl+C" onClick={action(copy)} />
          <Item label="Duplicate" shortcut="Ctrl+D" onClick={action(duplicate)} />
          <Item label="Delete" shortcut="Del" onClick={action(del)} />
          <Divider />
          {selectedIds.length === 1 && (
            <>
              <Item label="Bring to Front" shortcut="Shift+]" onClick={action(toFront)} />
              <Item label="Send to Back" shortcut="Shift+[" onClick={action(toBack)} />
              <Divider />
            </>
          )}
        </>
      )}
      <Item label="Paste" shortcut="Ctrl+V" onClick={action(paste)} disabled={useEditorStore.getState().clipboard.length === 0} />
      <Item label="Select All" shortcut="Ctrl+A" onClick={action(() => {
        useEditorStore.getState().setSelectedIds(useProjectStore.getState().annotations.map((a) => a.id))
      })} />
      {multiSelect && (
        <>
          <Divider />
          <div className="px-3 py-1 text-[10px] text-gray-500 uppercase tracking-wider">Align</div>
          <Item label="Align Left" onClick={action(() => alignLeft(selectedIds))} />
          <Item label="Align Right" onClick={action(() => alignRight(selectedIds))} />
          <Item label="Align Top" onClick={action(() => alignTop(selectedIds))} />
          <Item label="Align Bottom" onClick={action(() => alignBottom(selectedIds))} />
          <Item label="Center Horizontally" onClick={action(() => alignCenterH(selectedIds))} />
          <Item label="Center Vertically" onClick={action(() => alignCenterV(selectedIds))} />
          {selectedIds.length >= 3 && (
            <>
              <Divider />
              <Item label="Distribute Horizontally" onClick={action(() => distributeH(selectedIds))} />
              <Item label="Distribute Vertically" onClick={action(() => distributeV(selectedIds))} />
            </>
          )}
        </>
      )}
    </div>
  )
}

function Item({ label, shortcut, onClick, disabled }: { label: string; shortcut?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between ${disabled ? 'text-gray-600' : 'text-gray-200 hover:bg-surface-raised'}`}
    >
      <span>{label}</span>
      {shortcut && <span className="text-[10px] text-gray-500 ml-4">{shortcut}</span>}
    </button>
  )
}

function Divider() {
  return <div className="h-px bg-border mx-2 my-1" />
}
