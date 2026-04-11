// The project store owns every piece of user-authored state: images,
// annotations, ROIs, connectors, and the counter/history bookkeeping
// that sits around them. Everything not persisted to a saved project
// file lives in editorStore instead -- zoom, selection, active tool.
// Keeping the two stores separate means the "is the project dirty?"
// question only has to watch projectStore, and undo/redo snapshots
// don't bloat with transient UI state.

import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import {
  Annotation, ImageItem, ROI, Connector, Project, HistoryEntry,
  ROI_COLORS,
} from '../types'

interface ProjectState {
  // Project metadata
  projectId: string | null
  projectName: string
  canvasWidth: number
  canvasHeight: number

  // Data
  images: ImageItem[]
  annotations: Annotation[]
  rois: ROI[]
  connectors: Connector[]

  // Counter tracking
  nextCounter: number

  // History (undo/redo)
  history: HistoryEntry[]
  historyIndex: number

  // Dirty state
  isDirty: boolean
  markDirty: () => void
  markClean: () => void

  // Version history (project snapshots)
  versions: { timestamp: number; name: string; data: string }[]
  saveVersion: (name?: string) => void
  restoreVersion: (index: number) => void

  // Actions
  setProjectMeta: (name: string, w: number, h: number) => void
  setProjectId: (id: string | null) => void

  addImage: (img: Omit<ImageItem, 'id'>) => string
  updateImage: (id: string, patch: Partial<ImageItem>) => void
  removeImage: (id: string) => void
  moveImageForward: (id: string) => void
  moveImageBackward: (id: string) => void

  addAnnotation: (ann: Annotation) => void
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void
  removeAnnotation: (id: string) => void

  // Layer ordering
  moveAnnotationToFront: (id: string) => void
  moveAnnotationToBack: (id: string) => void
  moveAnnotationForward: (id: string) => void
  moveAnnotationBackward: (id: string) => void

  addROI: (roi: Omit<ROI, 'id' | 'number' | 'color'>) => ROI
  updateROI: (id: string, patch: Partial<ROI>) => void
  removeROI: (id: string) => void

  addConnector: (conn: Omit<Connector, 'id'>) => void
  updateConnector: (id: string, patch: Partial<Connector>) => void
  removeConnector: (id: string) => void

  // Grouping
  groupAnnotations: (ids: string[]) => void
  ungroupAnnotations: (ids: string[]) => void
  getGroupMembers: (groupId: string) => string[]

  // Counter
  getNextCounter: () => number
  setNextCounter: (n: number) => void
  renumberCounters: () => void

  // History
  pushHistory: () => void
  undo: () => void
  redo: () => void

  // Serialization
  toProject: () => Project
  loadProject: (p: Project, id?: string) => void
  clearProject: () => void
}

// Structural clone via JSON round-trip. Good enough because every shape
// in a history entry is plain JSON-safe data (no Dates, no functions,
// no typed arrays). Using structuredClone() instead would work too but
// isn't meaningfully faster at these sizes and adds a browser-version
// floor we don't otherwise need.
const makeSnapshot = (state: Pick<ProjectState, 'annotations' | 'images' | 'rois' | 'connectors'>): HistoryEntry => ({
  annotations: JSON.parse(JSON.stringify(state.annotations)),
  images: JSON.parse(JSON.stringify(state.images)),
  rois: JSON.parse(JSON.stringify(state.rois)),
  connectors: JSON.parse(JSON.stringify(state.connectors)),
})

export const useProjectStore = create<ProjectState>((set, get) => ({
  projectId: null,
  projectName: 'Untitled',
  canvasWidth: 1920,
  canvasHeight: 1080,
  images: [],
  annotations: [],
  rois: [],
  connectors: [],
  nextCounter: 1,
  history: [],
  historyIndex: -1,
  isDirty: false,
  versions: [],

  markDirty: () => set({ isDirty: true }),
  markClean: () => set({ isDirty: false }),

  saveVersion: (name) => {
    const s = get()
    const project = s.toProject()
    const entry = {
      timestamp: Date.now(),
      name: name || `v${s.versions.length + 1}`,
      data: JSON.stringify(project),
    }
    set({ versions: [...s.versions, entry] })
  },
  restoreVersion: (index) => {
    const s = get()
    const v = s.versions[index]
    if (!v) return
    const project = JSON.parse(v.data)
    s.loadProject(project, s.projectId ?? undefined)
    s.pushHistory()
  },

  setProjectMeta: (name, w, h) => set({ projectName: name, canvasWidth: w, canvasHeight: h, isDirty: true }),
  setProjectId: (id) => set({ projectId: id }),

  addImage: (img) => {
    const id = uuid()
    set((s) => ({ images: [...s.images, { ...img, id }] }))
    return id
  },
  updateImage: (id, patch) =>
    set((s) => ({
      images: s.images.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    })),
  removeImage: (id) =>
    set((s) => ({
      images: s.images.filter((i) => i.id !== id),
      connectors: s.connectors.filter((c) => c.toImageId !== id),
    })),
  moveImageForward: (id) => set((s) => {
    const idx = s.images.findIndex((i) => i.id === id)
    if (idx < 0 || idx === s.images.length - 1) return s
    const arr = [...s.images]
    ;[arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]]
    return { images: arr }
  }),
  moveImageBackward: (id) => set((s) => {
    const idx = s.images.findIndex((i) => i.id === id)
    if (idx <= 0) return s
    const arr = [...s.images]
    ;[arr[idx], arr[idx - 1]] = [arr[idx - 1], arr[idx]]
    return { images: arr }
  }),

  addAnnotation: (ann) => set((s) => ({ annotations: [...s.annotations, ann] })),
  updateAnnotation: (id, patch) =>
    set((s) => ({
      annotations: s.annotations.map((a) =>
        a.id === id ? ({ ...a, ...patch } as Annotation) : a,
      ),
    })),
  removeAnnotation: (id) =>
    set((s) => ({
      annotations: s.annotations.filter((a) => a.id !== id),
    })),

  moveAnnotationToFront: (id) => set((s) => {
    const idx = s.annotations.findIndex((a) => a.id === id)
    if (idx < 0 || idx === s.annotations.length - 1) return s
    const arr = [...s.annotations]
    const [item] = arr.splice(idx, 1)
    arr.push(item)
    return { annotations: arr }
  }),
  moveAnnotationToBack: (id) => set((s) => {
    const idx = s.annotations.findIndex((a) => a.id === id)
    if (idx <= 0) return s
    const arr = [...s.annotations]
    const [item] = arr.splice(idx, 1)
    arr.unshift(item)
    return { annotations: arr }
  }),
  moveAnnotationForward: (id) => set((s) => {
    const idx = s.annotations.findIndex((a) => a.id === id)
    if (idx < 0 || idx === s.annotations.length - 1) return s
    const arr = [...s.annotations]
    ;[arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]]
    return { annotations: arr }
  }),
  moveAnnotationBackward: (id) => set((s) => {
    const idx = s.annotations.findIndex((a) => a.id === id)
    if (idx <= 0) return s
    const arr = [...s.annotations]
    ;[arr[idx], arr[idx - 1]] = [arr[idx - 1], arr[idx]]
    return { annotations: arr }
  }),

  addROI: (roiData) => {
    const s = get()
    const number = s.rois.length + 1
    const color = ROI_COLORS[(number - 1) % ROI_COLORS.length]
    const roi: ROI = { ...roiData, id: uuid(), number, color }
    set({ rois: [...s.rois, roi] })
    return roi
  },
  updateROI: (id, patch) =>
    set((s) => ({
      rois: s.rois.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    })),
  removeROI: (id) =>
    set((s) => ({
      rois: s.rois.filter((r) => r.id !== id),
      connectors: s.connectors.filter((c) => c.fromRoiId !== id),
    })),

  addConnector: (conn) => {
    const id = uuid()
    set((s) => ({ connectors: [...s.connectors, { ...conn, id }] }))
  },
  updateConnector: (id, patch) =>
    set((s) => ({
      connectors: s.connectors.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })),
  removeConnector: (id) =>
    set((s) => ({
      connectors: s.connectors.filter((c) => c.id !== id),
    })),

  getNextCounter: () => {
    const n = get().nextCounter
    set({ nextCounter: n + 1 })
    return n
  },
  setNextCounter: (n: number) => set({ nextCounter: Math.max(1, n) }),

  groupAnnotations: (ids: string[]) => set((s) => {
    if (ids.length < 2) return s
    const gid = uuid()
    return { annotations: s.annotations.map(a => ids.includes(a.id) ? { ...a, groupId: gid } : a) }
  }),
  ungroupAnnotations: (ids: string[]) => set((s) => {
    return { annotations: s.annotations.map(a => ids.includes(a.id) ? { ...a, groupId: undefined } : a) }
  }),
  getGroupMembers: (groupId: string) => {
    return get().annotations.filter(a => a.groupId === groupId).map(a => a.id)
  },

  renumberCounters: () =>
    set((s) => {
      const counters = s.annotations
        .filter((a) => a.type === 'counter')
        .sort((a, b) => a.y - b.y || a.x - b.x)
      let num = 1
      const updated = s.annotations.map((a) => {
        if (a.type === 'counter') {
          const idx = counters.indexOf(a)
          if (idx >= 0) return { ...a, number: idx + 1 }
        }
        return a
      })
      return { annotations: updated, nextCounter: counters.length + 1 }
    }),

  // Push a new history entry. Slicing off everything past historyIndex
  // discards any redo stack that was still live -- a new action after
  // an undo branches the timeline. The 50-entry cap drops the oldest
  // snapshot once the stack is full so memory stays bounded on long
  // editing sessions (projects with 20+ large data-URL images make
  // each snapshot non-trivial).
  pushHistory: () =>
    set((s) => {
      const snap = makeSnapshot(s)
      const newHistory = s.history.slice(0, s.historyIndex + 1)
      newHistory.push(snap)
      if (newHistory.length > 50) newHistory.shift()
      return { history: newHistory, historyIndex: newHistory.length - 1, isDirty: true }
    }),

  undo: () =>
    set((s) => {
      if (s.historyIndex <= 0) return s
      const idx = s.historyIndex - 1
      const entry = s.history[idx]
      return {
        ...entry,
        historyIndex: idx,
      }
    }),

  redo: () =>
    set((s) => {
      if (s.historyIndex >= s.history.length - 1) return s
      const idx = s.historyIndex + 1
      const entry = s.history[idx]
      return {
        ...entry,
        historyIndex: idx,
      }
    }),

  toProject: () => {
    const s = get()
    return {
      version: 1,
      name: s.projectName,
      canvasWidth: s.canvasWidth,
      canvasHeight: s.canvasHeight,
      images: s.images,
      annotations: s.annotations,
      rois: s.rois,
      connectors: s.connectors,
    }
  },

  loadProject: (p, id) =>
    set({
      projectId: id ?? null,
      projectName: p.name,
      canvasWidth: p.canvasWidth,
      canvasHeight: p.canvasHeight,
      images: p.images,
      annotations: p.annotations,
      rois: p.rois,
      connectors: p.connectors,
      nextCounter:
        p.annotations.filter((a) => a.type === 'counter').length + 1,
      history: [],
      historyIndex: -1,
    }),

  clearProject: () =>
    set({
      projectId: null,
      projectName: 'Untitled',
      canvasWidth: 1920,
      canvasHeight: 1080,
      images: [],
      annotations: [],
      rois: [],
      connectors: [],
      nextCounter: 1,
      history: [],
      historyIndex: -1,
    }),
}))
