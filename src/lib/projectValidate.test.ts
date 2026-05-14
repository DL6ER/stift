import { describe, it, expect } from 'vitest'
import { validateProject } from './projectValidate'

const validProject = {
  name: 'Test',
  canvasWidth: 1920,
  canvasHeight: 1080,
  images: [],
  annotations: [],
  rois: [],
  connectors: [],
}

describe('validateProject', () => {
  it('accepts a minimal valid project', () => {
    expect(() => validateProject(validProject)).not.toThrow()
  })

  it('rejects null / non-object input', () => {
    expect(() => validateProject(null)).toThrow(/must be an object/)
    expect(() => validateProject(42)).toThrow(/must be an object/)
    expect(() => validateProject('text')).toThrow(/must be an object/)
  })

  it('rejects missing or non-string name', () => {
    expect(() => validateProject({ ...validProject, name: 123 })).toThrow(/name/)
    expect(() => validateProject({ ...validProject, name: undefined })).toThrow(/name/)
  })

  it('rejects non-finite canvas dimensions', () => {
    expect(() => validateProject({ ...validProject, canvasWidth: 'ten' })).toThrow(/canvasWidth/)
    expect(() => validateProject({ ...validProject, canvasHeight: Infinity })).toThrow(/canvasHeight/)
    expect(() => validateProject({ ...validProject, canvasWidth: -1 })).toThrow(/canvasWidth/)
    expect(() => validateProject({ ...validProject, canvasWidth: 0 })).toThrow(/canvasWidth/)
  })

  it('rejects non-array data fields', () => {
    expect(() => validateProject({ ...validProject, images: 'nope' })).toThrow(/images/)
    expect(() => validateProject({ ...validProject, annotations: {} })).toThrow(/annotations/)
    expect(() => validateProject({ ...validProject, rois: null })).toThrow(/rois/)
    expect(() => validateProject({ ...validProject, connectors: 5 })).toThrow(/connectors/)
  })

  it('rejects arrays that exceed the safety caps', () => {
    const tooManyAnnotations = Array.from({ length: 10001 }, (_, i) => ({ id: String(i), type: 'rect' }))
    expect(() => validateProject({ ...validProject, annotations: tooManyAnnotations })).toThrow(/too many entries/)
  })

  it('rejects malformed image entries', () => {
    expect(() => validateProject({ ...validProject, images: [{ data: 'data:image/png;base64,xxx' }] })).toThrow(/images\[0\]\.id/)
    expect(() => validateProject({ ...validProject, images: [{ id: 'img1' }] })).toThrow(/images\[0\]\.data/)
    expect(() => validateProject({ ...validProject, images: [null] })).toThrow(/images\[0\]/)
  })

  it('rejects malformed annotation entries', () => {
    expect(() => validateProject({ ...validProject, annotations: [{ type: 'rect' }] })).toThrow(/annotations\[0\]\.id/)
    expect(() => validateProject({ ...validProject, annotations: [{ id: 'a1' }] })).toThrow(/annotations\[0\]\.type/)
  })

  it('accepts a project with realistic image and annotation entries', () => {
    const p = {
      ...validProject,
      images: [{ id: 'i1', data: 'data:image/webp;base64,abc' }],
      annotations: [{ id: 'a1', type: 'rect' }],
    }
    expect(() => validateProject(p)).not.toThrow()
  })
})
