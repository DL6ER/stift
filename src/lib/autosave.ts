// Local-only recovery autosave: every 30s we stash the current project
// in localStorage so a reload / crash / accidental tab close doesn't
// lose in-progress work. This is distinct from server persistence --
// the autosave blob never leaves the browser and doesn't go through
// the E2E encryption layer. App.tsx restores from it on startup when
// the snapshot is less than 24h old and was written under the same
// username as the currently authenticated session (anonymous matches
// anonymous). The username tag prevents the previous user's work from
// surfacing in the next user's session on a shared browser.

import { useProjectStore } from '../stores/projectStore'
import { useAuthStore } from '../stores/authStore'

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
      const username = useAuthStore.getState().username ?? null
      const snapshot = JSON.stringify({ username, project })
      localStorage.setItem(AUTOSAVE_KEY, snapshot)
      localStorage.setItem(AUTOSAVE_KEY + '-time', new Date().toISOString())
    } catch {
      // localStorage might be full -- silently fail
    }
  }, AUTOSAVE_INTERVAL)
}

// Returned `username` is null for anonymous snapshots and a sentinel
// '__legacy__' for pre-tag snapshots written before this format change --
// callers should treat the legacy case as "do not auto-restore", since we
// can't tell which user produced it.
export function getAutosave(): { project: any; username: string | null; time: string } | null {
  try {
    const data = localStorage.getItem(AUTOSAVE_KEY)
    const time = localStorage.getItem(AUTOSAVE_KEY + '-time')
    if (!data || !time) return null
    const parsed = JSON.parse(data)
    if (parsed && typeof parsed === 'object' && 'project' in parsed && 'username' in parsed) {
      return { username: parsed.username, project: parsed.project, time }
    }
    return { username: '__legacy__', project: parsed, time }
  } catch {
    return null
  }
}

export function clearAutosave() {
  localStorage.removeItem(AUTOSAVE_KEY)
  localStorage.removeItem(AUTOSAVE_KEY + '-time')
}
