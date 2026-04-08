// Floating <textarea> overlay used while a Text or TextBox annotation
// is being edited. Konva can render text but its built-in editor is
// minimal, so we hide the Konva node, position a real DOM textarea
// at the same screen coordinates, let the browser do its native
// editing, and write the result back on blur.

import { useEffect, useRef } from 'react'
import { useEditorStore } from '../stores/editorStore'
import { useProjectStore } from '../stores/projectStore'

export function InlineTextEditor() {
  const editingTextId = useEditorStore((s) => s.editingTextId)
  const setEditingTextId = useEditorStore((s) => s.setEditingTextId)
  const zoom = useEditorStore((s) => s.zoom)
  const stagePos = useEditorStore((s) => s.stagePos)
  const annotations = useProjectStore((s) => s.annotations)
  const updateAnnotation = useProjectStore((s) => s.updateAnnotation)
  const removeAnnotation = useProjectStore((s) => s.removeAnnotation)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const committedRef = useRef(false)

  const ann = editingTextId
    ? annotations.find((a) => a.id === editingTextId)
    : null

  useEffect(() => {
    committedRef.current = false
    if (ann && textareaRef.current) {
      textareaRef.current.focus()
      if ((ann as any).text) {
        textareaRef.current.select()
      }
    }
  }, [ann?.id])

  if (!ann || (ann.type !== 'text' && ann.type !== 'textbox')) return null

  const commit = () => {
    if (committedRef.current) return
    committedRef.current = true
    const text = textareaRef.current?.value ?? ''
    if (text.trim() === '' && ann.type === 'text') {
      // Only remove plain text annotations when empty -- keep textboxes as empty containers
      removeAnnotation(ann.id)
    } else {
      updateAnnotation(ann.id, { text } as any)
    }
    setEditingTextId(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      commit()
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      commit()
    }
    e.stopPropagation()
  }

  const screenX = ann.x * zoom + stagePos.x
  const screenY = ann.y * zoom + stagePos.y
  const fontSize = Math.max(10, (ann as any).fontSize * zoom)
  const isTextBox = ann.type === 'textbox'

  return (
    <textarea
      ref={textareaRef}
      defaultValue={(ann as any).text || ''}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      style={{
        position: 'absolute',
        left: screenX + (isTextBox ? (ann as any).padding * zoom : 0),
        top: screenY + (isTextBox ? (ann as any).padding * zoom : 0),
        minWidth: Math.max(120, 200 * zoom),
        maxWidth: Math.max(200, 600 * zoom),
        minHeight: fontSize * 1.5,
        fontSize,
        fontFamily: (ann as any).fontFamily || 'sans-serif',
        color: (ann as any).fill || '#000',
        background: 'rgba(255,255,255,0.95)',
        border: '2px solid #6366f1',
        borderRadius: 4,
        padding: '4px 6px',
        outline: 'none',
        resize: 'both',
        overflow: 'auto',
        zIndex: 1000,
        lineHeight: 1.3,
      }}
    />
  )
}
