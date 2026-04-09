// Editor-only state: active tool, selection, zoom/pan, transient
// drawing state, and the style defaults that new annotations inherit.
// None of this is persisted to a saved project -- that's projectStore's
// job. Split this way so undo/redo snapshots stay small and switching
// tools doesn't mark the project dirty.

import { create } from 'zustand'
import { ToolType, Annotation, DEFAULT_STROKE_COLOR, DEFAULT_FILL_COLOR, DEFAULT_STROKE_WIDTH, DEFAULT_FONT_SIZE, DEFAULT_FONT_FAMILY, DEFAULT_BLUR_PIXEL_SIZE } from '../types'

interface EditorState {
  activeTool: ToolType
  setActiveTool: (tool: ToolType) => void

  // Drawing properties
  strokeColor: string
  fillColor: string
  strokeWidth: number
  fontSize: number
  fontFamily: string
  blurPixelSize: number
  opacity: number

  setStrokeColor: (c: string) => void
  setFillColor: (c: string) => void
  setStrokeWidth: (w: number) => void
  setFontSize: (s: number) => void
  setFontFamily: (f: string) => void
  setBlurPixelSize: (s: number) => void
  setOpacity: (o: number) => void

  // Selection
  selectedIds: string[]
  setSelectedIds: (ids: string[]) => void

  // Canvas
  zoom: number
  stagePos: { x: number; y: number }
  setZoom: (z: number) => void
  setStagePos: (p: { x: number; y: number }) => void

  // UI toggles
  showGrid: boolean
  toggleGrid: () => void
  snapToGrid: boolean
  toggleSnap: () => void
  gridSize: number
  canvasBgColor: string
  setCanvasBgColor: (c: string) => void

  // Clipboard for copy/paste
  clipboard: Annotation[]
  setClipboard: (anns: Annotation[]) => void

  // Inline text editing
  editingTextId: string | null
  setEditingTextId: (id: string | null) => void

  // Connector tool state
  pendingConnectorRoiId: string | null
  setPendingConnectorRoiId: (id: string | null) => void

  // Image crop mode
  croppingImageId: string | null
  setCroppingImageId: (id: string | null) => void

  // Drawing state (transient, for active tool drawing)
  isDrawing: boolean
  setIsDrawing: (d: boolean) => void

  // Right-side property panel: when pinned, stays open even with no
  // selection so the user can tweak tool defaults. When unpinned, the
  // panel auto-collapses to a thin strip whenever nothing is selected.
  // Persisted to localStorage so the preference survives reloads.
  propertyPanelPinned: boolean
  togglePropertyPanelPinned: () => void
}

const PIN_STORAGE_KEY = 'stift.propertyPanelPinned'
const initialPin = (() => {
  try { return localStorage.getItem(PIN_STORAGE_KEY) === 'true' } catch { return false }
})()

export const useEditorStore = create<EditorState>((set) => ({
  activeTool: 'select',
  setActiveTool: (tool) => set({ activeTool: tool, selectedIds: [], croppingImageId: null }),

  strokeColor: DEFAULT_STROKE_COLOR,
  fillColor: 'transparent',
  strokeWidth: DEFAULT_STROKE_WIDTH,
  fontSize: DEFAULT_FONT_SIZE,
  fontFamily: DEFAULT_FONT_FAMILY,
  blurPixelSize: DEFAULT_BLUR_PIXEL_SIZE,
  opacity: 1,

  setStrokeColor: (c) => set({ strokeColor: c }),
  setFillColor: (c) => set({ fillColor: c }),
  setStrokeWidth: (w) => set({ strokeWidth: w }),
  setFontSize: (s) => set({ fontSize: s }),
  setFontFamily: (f) => set({ fontFamily: f }),
  setBlurPixelSize: (s) => set({ blurPixelSize: s }),
  setOpacity: (o) => set({ opacity: o }),

  selectedIds: [],
  setSelectedIds: (ids) => set({ selectedIds: ids }),

  zoom: 1,
  stagePos: { x: 0, y: 0 },
  setZoom: (z) => set({ zoom: z }),
  setStagePos: (p) => set({ stagePos: p }),

  showGrid: false,
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  snapToGrid: false,
  toggleSnap: () => set((s) => ({ snapToGrid: !s.snapToGrid })),
  gridSize: 20,
  canvasBgColor: 'transparent',
  setCanvasBgColor: (c) => set({ canvasBgColor: c }),

  clipboard: [],
  setClipboard: (anns) => set({ clipboard: anns }),

  editingTextId: null,
  setEditingTextId: (id) => set({ editingTextId: id }),

  pendingConnectorRoiId: null,
  setPendingConnectorRoiId: (id) => set({ pendingConnectorRoiId: id }),

  croppingImageId: null,
  setCroppingImageId: (id) => set({ croppingImageId: id }),

  isDrawing: false,
  setIsDrawing: (d) => set({ isDrawing: d }),

  propertyPanelPinned: initialPin,
  togglePropertyPanelPinned: () => set((s) => {
    const next = !s.propertyPanelPinned
    try { localStorage.setItem(PIN_STORAGE_KEY, String(next)) } catch {}
    return { propertyPanelPinned: next }
  }),
}))
