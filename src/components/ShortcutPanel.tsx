import { useState, useEffect } from 'react'
import { X } from 'lucide-react'

const SHORTCUTS = [
  ['Tools', [
    ['V', 'Select / Move'], ['A', 'Arrow'], ['T', 'Text'], ['G', 'Text Box'],
    ['H', 'Highlight'], ['B', 'Blur'], ['R', 'Rectangle'], ['E', 'Ellipse'],
    ['L', 'Line'], ['D', 'Freehand Draw'], ['X', 'Color Box'], ['N', 'Counter'],
    ['M', 'Dimension'], ['K', 'Connector'], ['I', 'Eyedropper'], ['Z', 'Magnifier'],
  ]],
  ['Actions', [
    ['Ctrl+Z', 'Undo'], ['Ctrl+Y', 'Redo'], ['Ctrl+C', 'Copy'], ['Ctrl+V', 'Paste'],
    ['Ctrl+D', 'Duplicate'], ['Ctrl+A', 'Select All'], ['Ctrl+S', 'Save'],
    ['Delete', 'Remove'], ['Escape', 'Deselect'],
  ]],
  ['Navigation', [
    ['Scroll', 'Zoom'], ['Ctrl+=', 'Zoom In'], ['Ctrl+-', 'Zoom Out'], ['Ctrl+0', '100%'],
    ['Space+Drag', 'Pan'], ['Shift+Click', 'Multi-select'],
  ]],
  ['Drawing modifiers', [
    ['Shift+Drag', 'Snap angle / square / proportional resize'],
  ]],
  ['Editing', [
    ['Arrow Keys', 'Nudge 1px'], ['Shift+Arrow', 'Nudge 10px'],
    [']', 'Layer Forward'], ['[', 'Layer Backward'],
    ['Shift+]', 'To Front'], ['Shift+[', 'To Back'],
    ['Double-click', 'Edit Text / Crop Image'],
  ]],
] as const

export function ShortcutPanel() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) {
        e.preventDefault()
        setVisible((v) => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setVisible(false)}>
      <div className="bg-surface-raised border border-border rounded-xl shadow-2xl w-[600px] max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-200">Keyboard Shortcuts</h2>
          <button onClick={() => setVisible(false)} className="text-gray-500 hover:text-gray-300"><X size={18} /></button>
        </div>
        <div className="grid grid-cols-2 gap-6">
          {SHORTCUTS.map(([section, items]) => (
            <div key={section}>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{section}</h3>
              <div className="space-y-1">
                {items.map(([key, action]) => (
                  <div key={key} className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">{action}</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-surface-overlay border border-border text-[11px] font-mono text-gray-300">{key}</kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-gray-600 mt-4 text-center">Press <kbd className="px-1 py-0.5 rounded bg-surface-overlay border border-border text-[10px] font-mono">?</kbd> to toggle this panel</p>
      </div>
    </div>
  )
}
