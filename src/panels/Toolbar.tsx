// Left-edge tool palette. Renders one button per ToolType in a fixed
// order, plus the keyboard shortcut hint that App.tsx's keybind
// handler uses. New tools get added in two places: the ToolType
// union in types.ts, and the `tools` array below.

import {
  MousePointer2, MoveRight, Type, Highlighter, Grid3x3,
  Square, Circle, Minus, Pencil, PaintBucket, Hash,
  Link, TextCursorInput, Ruler, Stamp,
} from 'lucide-react'
import { useEditorStore } from '../stores/editorStore'
import { ToolType } from '../types'

const tools: { id: ToolType; icon: React.ElementType; label: string; shortcut: string }[] = [
  { id: 'select', icon: MousePointer2, label: 'Select / Move', shortcut: 'V' },
  { id: 'arrow', icon: MoveRight, label: 'Arrow', shortcut: 'A' },
  { id: 'text', icon: Type, label: 'Text', shortcut: 'T' },
  { id: 'textbox', icon: TextCursorInput, label: 'Text Box', shortcut: 'G' },
  { id: 'highlight', icon: Highlighter, label: 'Highlight', shortcut: 'H' },
  { id: 'blur', icon: Grid3x3, label: 'Blur / Pixelate', shortcut: 'B' },
  { id: 'rectangle', icon: Square, label: 'Rectangle', shortcut: 'R' },
  { id: 'ellipse', icon: Circle, label: 'Ellipse', shortcut: 'E' },
  { id: 'line', icon: Minus, label: 'Line', shortcut: 'L' },
  { id: 'draw', icon: Pencil, label: 'Freehand Draw', shortcut: 'D' },
  { id: 'colorbox', icon: PaintBucket, label: 'Color Box (Redaction)', shortcut: 'X' },
  { id: 'counter', icon: Hash, label: 'Counter', shortcut: 'N' },
  { id: 'dimension', icon: Ruler, label: 'Dimension / Measure', shortcut: 'M' },
  { id: 'stamp', icon: Stamp, label: 'Stamp / Watermark', shortcut: 'W' },
  { id: 'connector', icon: Link, label: 'Connector', shortcut: 'K' },
]

export function Toolbar() {
  const activeTool = useEditorStore((s) => s.activeTool)
  const setActiveTool = useEditorStore((s) => s.setActiveTool)

  return (
    <div className="w-12 bg-surface-raised border-r border-border flex flex-col items-center py-2 gap-0.5 overflow-y-auto">
      {tools.map((tool) => {
        const Icon = tool.icon
        const isActive = activeTool === tool.id
        return (
          <button
            key={tool.id}
            onClick={() => setActiveTool(tool.id)}
            className={`
              relative w-10 h-10 flex items-center justify-center rounded-md transition-colors group shrink-0
              ${isActive
                ? 'bg-accent text-white'
                : 'text-gray-400 hover:bg-surface-overlay hover:text-gray-200'
              }
            `}
            title={`${tool.label} (${tool.shortcut})`}
          >
            <Icon size={18} />
            <span
              className={`
                absolute bottom-0.5 right-0.5 text-[9px] leading-none font-medium pointer-events-none
                ${isActive ? 'text-white/60' : 'text-gray-600 group-hover:text-gray-500'}
              `}
            >
              {tool.shortcut}
            </span>
          </button>
        )
      })}
    </div>
  )
}
