// Thin wrapper around the OSS file-server API. Every call reads the
// cached auth token from localStorage (set by authStore on login) and
// forwards it as X-Auth-Username / X-Auth-Token headers. The project
// payloads themselves travel already-encrypted; the server is
// deliberately dumb about shape and never looks inside.

import { Project } from '../types'

const BASE = '/api'

export async function registerWithInvite(username: string, authToken: string, invite: string): Promise<void> {
  const res = await fetch(`${BASE}/auth/register-with-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, authToken, invite }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Registration failed' }))
    throw new Error(err.error || 'Registration failed')
  }
}

export async function applyInvite(username: string, authToken: string, invite: string): Promise<void> {
  const res = await fetch(`${BASE}/auth/apply-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, authToken, invite }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to apply invitation' }))
    throw new Error(err.error || 'Failed to apply invitation')
  }
}

function authHeaders(): Record<string, string> {
  const user = localStorage.getItem('stift-auth-username')
  const token = localStorage.getItem('stift-auth-token')
  if (!user || !token) return {}
  return { 'X-Auth-Username': user, 'X-Auth-Token': token }
}

export async function listProjects(): Promise<any[]> {
  const res = await fetch(`${BASE}/projects`, { headers: authHeaders() })
  if (res.status === 401) throw new Error('Authentication required')
  if (!res.ok) throw new Error('Failed to list projects')
  return res.json()
}

export async function loadProject(id: string): Promise<Project> {
  const res = await fetch(`${BASE}/projects/${encodeURIComponent(id)}`, { headers: authHeaders() })
  if (res.status === 401) throw new Error('Authentication required')
  if (!res.ok) throw new Error('Failed to load project')
  return res.json()
}

export async function saveProject(id: string, project: any): Promise<void> {
  const res = await fetch(`${BASE}/projects/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(project),
  })
  if (res.status === 401) throw new Error('Authentication required')
  if (res.status === 413) throw new Error('Project limit reached')
  if (!res.ok) throw new Error('Failed to save project')
}

export async function createProject(project: any): Promise<{ id: string }> {
  const res = await fetch(`${BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(project),
  })
  if (res.status === 401) throw new Error('Authentication required')
  if (res.status === 413) throw new Error('Project limit reached')
  if (!res.ok) throw new Error('Failed to create project')
  return res.json()
}

// -- Shared projects --

export async function listSharedProjects(): Promise<any[]> {
  const res = await fetch(`${BASE}/shared`, { headers: authHeaders() })
  if (res.status === 401) throw new Error('Authentication required')
  if (!res.ok) throw new Error('Failed to list shared projects')
  return res.json()
}

export async function loadSharedProject(id: string): Promise<any> {
  const res = await fetch(`${BASE}/shared/${encodeURIComponent(id)}`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to load shared project')
  return res.json()
}

export async function createSharedProject(project: any): Promise<{ id: string }> {
  const res = await fetch(`${BASE}/shared`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(project),
  })
  if (!res.ok) throw new Error('Failed to create shared project')
  return res.json()
}

export async function saveSharedProject(id: string, project: any): Promise<void> {
  const res = await fetch(`${BASE}/shared/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(project),
  })
  if (!res.ok) throw new Error('Failed to save shared project')
}

export async function inviteMember(projectId: string, username: string, role: string, wrappedKey: string): Promise<void> {
  const res = await fetch(`${BASE}/shared/${encodeURIComponent(projectId)}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ username, role, wrappedKey }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed' }))
    throw new Error(err.error || 'Failed to invite member')
  }
}

export async function removeMember(projectId: string, username: string): Promise<void> {
  const res = await fetch(`${BASE}/shared/${encodeURIComponent(projectId)}/members/${encodeURIComponent(username)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error('Failed to remove member')
}

export async function deleteSharedProject(id: string): Promise<void> {
  const res = await fetch(`${BASE}/shared/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error('Failed to delete shared project')
}

export async function deleteProject(id: string): Promise<void> {
  const res = await fetch(`${BASE}/projects/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (res.status === 401) throw new Error('Authentication required')
  if (!res.ok) throw new Error('Failed to delete project')
}
