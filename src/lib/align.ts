// Alignment and distribution helpers used by the multi-select toolbar.
// Each function reads the current set of selected ids, computes a target
// edge or centre across their bounding boxes, and rewrites the x/y of
// each participant in a single history entry. Annotations and images
// share the same bounds-and-reposition pair so both can be mixed in one
// selection.

import { useProjectStore } from '../stores/projectStore'

type Bounds = { x: number; y: number; w: number; h: number }

function getBounds(id: string): Bounds | null {
  const store = useProjectStore.getState()
  const ann = store.annotations.find((a) => a.id === id)
  if (ann) {
    if ('width' in ann && 'height' in ann) {
      const a = ann as any
      return { x: a.x, y: a.y, w: a.width || 0, h: a.height || 0 }
    }
    if ('radiusX' in ann) {
      const a = ann as any
      return { x: a.x, y: a.y, w: a.radiusX * 2, h: a.radiusY * 2 }
    }
    return { x: ann.x, y: ann.y, w: 0, h: 0 }
  }
  const img = store.images.find((i) => i.id === id)
  if (img) return { x: img.x, y: img.y, w: img.width, h: img.height }
  return null
}

function setPosition(id: string, x: number, y: number) {
  const store = useProjectStore.getState()
  if (store.annotations.find((a) => a.id === id)) {
    store.updateAnnotation(id, { x, y })
  } else if (store.images.find((i) => i.id === id)) {
    store.updateImage(id, { x, y })
  }
}

export function alignLeft(ids: string[]) {
  const bounds = ids.map((id) => ({ id, b: getBounds(id) })).filter((x) => x.b) as { id: string; b: Bounds }[]
  if (bounds.length < 2) return
  const minX = Math.min(...bounds.map((x) => x.b.x))
  useProjectStore.getState().pushHistory()
  for (const { id, b } of bounds) setPosition(id, minX, b.y)
}

export function alignRight(ids: string[]) {
  const bounds = ids.map((id) => ({ id, b: getBounds(id) })).filter((x) => x.b) as { id: string; b: Bounds }[]
  if (bounds.length < 2) return
  const maxR = Math.max(...bounds.map((x) => x.b.x + x.b.w))
  useProjectStore.getState().pushHistory()
  for (const { id, b } of bounds) setPosition(id, maxR - b.w, b.y)
}

export function alignTop(ids: string[]) {
  const bounds = ids.map((id) => ({ id, b: getBounds(id) })).filter((x) => x.b) as { id: string; b: Bounds }[]
  if (bounds.length < 2) return
  const minY = Math.min(...bounds.map((x) => x.b.y))
  useProjectStore.getState().pushHistory()
  for (const { id, b } of bounds) setPosition(id, b.x, minY)
}

export function alignBottom(ids: string[]) {
  const bounds = ids.map((id) => ({ id, b: getBounds(id) })).filter((x) => x.b) as { id: string; b: Bounds }[]
  if (bounds.length < 2) return
  const maxB = Math.max(...bounds.map((x) => x.b.y + x.b.h))
  useProjectStore.getState().pushHistory()
  for (const { id, b } of bounds) setPosition(id, b.x, maxB - b.h)
}

export function alignCenterH(ids: string[]) {
  const bounds = ids.map((id) => ({ id, b: getBounds(id) })).filter((x) => x.b) as { id: string; b: Bounds }[]
  if (bounds.length < 2) return
  const avgCx = bounds.reduce((s, x) => s + x.b.x + x.b.w / 2, 0) / bounds.length
  useProjectStore.getState().pushHistory()
  for (const { id, b } of bounds) setPosition(id, avgCx - b.w / 2, b.y)
}

export function alignCenterV(ids: string[]) {
  const bounds = ids.map((id) => ({ id, b: getBounds(id) })).filter((x) => x.b) as { id: string; b: Bounds }[]
  if (bounds.length < 2) return
  const avgCy = bounds.reduce((s, x) => s + x.b.y + x.b.h / 2, 0) / bounds.length
  useProjectStore.getState().pushHistory()
  for (const { id, b } of bounds) setPosition(id, b.x, avgCy - b.h / 2)
}

export function distributeH(ids: string[]) {
  const bounds = ids.map((id) => ({ id, b: getBounds(id) })).filter((x) => x.b) as { id: string; b: Bounds }[]
  if (bounds.length < 3) return
  bounds.sort((a, b) => a.b.x - b.b.x)
  const totalW = bounds.reduce((s, x) => s + x.b.w, 0)
  const span = bounds[bounds.length - 1].b.x + bounds[bounds.length - 1].b.w - bounds[0].b.x
  const gap = (span - totalW) / (bounds.length - 1)
  useProjectStore.getState().pushHistory()
  let curX = bounds[0].b.x
  for (const { id, b } of bounds) {
    setPosition(id, curX, b.y)
    curX += b.w + gap
  }
}

export function distributeV(ids: string[]) {
  const bounds = ids.map((id) => ({ id, b: getBounds(id) })).filter((x) => x.b) as { id: string; b: Bounds }[]
  if (bounds.length < 3) return
  bounds.sort((a, b) => a.b.y - b.b.y)
  const totalH = bounds.reduce((s, x) => s + x.b.h, 0)
  const span = bounds[bounds.length - 1].b.y + bounds[bounds.length - 1].b.h - bounds[0].b.y
  const gap = (span - totalH) / (bounds.length - 1)
  useProjectStore.getState().pushHistory()
  let curY = bounds[0].b.y
  for (const { id, b } of bounds) {
    setPosition(id, b.x, curY)
    curY += b.h + gap
  }
}
