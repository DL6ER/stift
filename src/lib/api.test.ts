import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listProjects, loadProject, saveProject, createProject, deleteProject } from './api'

const mockFetch = vi.fn()
globalThis.fetch = mockFetch as any

describe('API client', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('should list projects', async () => {
    const mockData = [
      { id: '1', name: 'Project 1', updatedAt: '2024-01-01' },
      { id: '2', name: 'Project 2', updatedAt: '2024-01-02' },
    ]
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData),
    })

    const result = await listProjects()
    expect(result).toEqual(mockData)
    expect(mockFetch).toHaveBeenCalledWith('/api/projects', expect.anything())
  })

  it('should load a project', async () => {
    const mockProject = { version: 1, name: 'Test', canvasWidth: 800, canvasHeight: 600 }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockProject),
    })

    const result = await loadProject('abc-123')
    expect(result).toEqual(mockProject)
    expect(mockFetch).toHaveBeenCalledWith('/api/projects/abc-123', expect.anything())
  })

  it('should save a project', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })
    const project = { version: 1, name: 'Test', canvasWidth: 800, canvasHeight: 600, images: [], annotations: [], rois: [], connectors: [] }

    await saveProject('abc-123', project as any)
    expect(mockFetch).toHaveBeenCalledWith('/api/projects/abc-123', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify(project),
    }))
  })

  it('should create a project', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'new-id' }),
    })
    const project = { version: 1, name: 'New', canvasWidth: 1920, canvasHeight: 1080, images: [], annotations: [], rois: [], connectors: [] }

    const result = await createProject(project as any)
    expect(result.id).toBe('new-id')
    expect(mockFetch).toHaveBeenCalledWith('/api/projects', expect.objectContaining({
      method: 'POST',
    }))
  })

  it('should delete a project', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })

    await deleteProject('abc-123')
    expect(mockFetch).toHaveBeenCalledWith('/api/projects/abc-123', expect.objectContaining({
      method: 'DELETE',
    }))
  })

  it('should throw on failed requests', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })
    await expect(listProjects()).rejects.toThrow('Failed to list projects')
  })

  it('should encode project IDs in URLs', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
    await loadProject('id with spaces')
    expect(mockFetch).toHaveBeenCalledWith('/api/projects/id%20with%20spaces', expect.anything())
  })
})
