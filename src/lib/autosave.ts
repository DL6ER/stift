// Local-only recovery autosave: every 30s we stash the current project
// in localStorage so a reload / crash / accidental tab close doesn't
// lose in-progress work. This is distinct from server persistence --
// the autosave blob never leaves the browser and doesn't go through
// the E2E encryption layer. App.tsx restores from it on startup when
// the snapshot is less than 24h old.

import { useProjectStore } from '../stores/projectStore'

const AUTOSAVE_KEY = 'stift-autosave'
const AUTOSAVE_INTERVAL = 30000 // 30s; short enough to matter, long enough not to hammer localStorage

let timer: ReturnType<typeof setInterval> | null = null

export function startAutosave() {
  if (timer) return
  timer = setInterval(() => {
    const state = useProjectStore.getState()
    if (!state.isDirty) return
    if (state.annotations.length === 0 && state.images.length === 0) return
    try {
      const project = state.toProject()
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(project))
      localStorage.setItem(AUTOSAVE_KEY + '-time', new Date().toISOString())
    } catch {
      // localStorage might be full -- silently fail
    }
  }, AUTOSAVE_INTERVAL)
}

export function getAutosave(): { project: any; time: string } | null {
  try {
    const data = localStorage.getItem(AUTOSAVE_KEY)
    const time = localStorage.getItem(AUTOSAVE_KEY + '-time')
    if (!data || !time) return null
    return { project: JSON.parse(data), time }
  } catch {
    return null
  }
}

export function clearAutosave() {
  localStorage.removeItem(AUTOSAVE_KEY)
  localStorage.removeItem(AUTOSAVE_KEY + '-time')
}
