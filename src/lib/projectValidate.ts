// Runtime shape validation for project payloads coming from outside the
// SPA -- .stift drag-and-drop primarily, plus a defensive pass on server
// loads in case a ciphertext is somehow malformed after decryption.
//
// TypeScript types vanish at runtime; if a hostile or corrupt JSON has
// images: "not-an-array" or canvasWidth: "ten", the Konva renderer and
// the project store would otherwise propagate the bad shape until
// something deep in the canvas pipeline throws a confusing TypeError.
//
// This validator returns a typed Project on success, or throws an Error
// with a message that names the first offending field. It does NOT
// attempt to repair the data -- the caller surfaces the failure to the
// user.

import type { Project } from '../types'

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function isPositiveFiniteNumber(v: unknown): v is number {
  return isFiniteNumber(v) && v > 0
}

function isString(v: unknown): v is string {
  return typeof v === 'string'
}

export function validateProject(input: unknown): Project {
  if (!input || typeof input !== 'object') {
    throw new Error('project must be an object')
  }
  const p = input as Record<string, unknown>

  if (!isString(p.name)) throw new Error('project.name must be a string')
  if (!isPositiveFiniteNumber(p.canvasWidth)) throw new Error('project.canvasWidth must be a positive finite number')
  if (!isPositiveFiniteNumber(p.canvasHeight)) throw new Error('project.canvasHeight must be a positive finite number')

  if (!Array.isArray(p.images)) throw new Error('project.images must be an array')
  if (!Array.isArray(p.annotations)) throw new Error('project.annotations must be an array')
  if (!Array.isArray(p.rois)) throw new Error('project.rois must be an array')
  if (!Array.isArray(p.connectors)) throw new Error('project.connectors must be an array')

  // Bound array sizes so a crafted file cannot lock up Konva by claiming
  // millions of entries; we never legitimately ship anywhere near these.
  if (p.images.length > 1000) throw new Error('project.images: too many entries')
  if (p.annotations.length > 10000) throw new Error('project.annotations: too many entries')
  if (p.rois.length > 1000) throw new Error('project.rois: too many entries')
  if (p.connectors.length > 1000) throw new Error('project.connectors: too many entries')

  // Per-image minimal sanity. We trust the rest of the shape to the
  // Konva renderer (it ignores unknown fields), but the id-and-data
  // contract has to be enforced because the store keys off id.
  for (let i = 0; i < p.images.length; i++) {
    const img = p.images[i] as Record<string, unknown> | null
    if (!img || typeof img !== 'object') throw new Error(`project.images[${i}] must be an object`)
    if (!isString(img.id)) throw new Error(`project.images[${i}].id must be a string`)
    if (!isString(img.data)) throw new Error(`project.images[${i}].data must be a string`)
  }
  for (let i = 0; i < p.annotations.length; i++) {
    const a = p.annotations[i] as Record<string, unknown> | null
    if (!a || typeof a !== 'object') throw new Error(`project.annotations[${i}] must be an object`)
    if (!isString(a.id)) throw new Error(`project.annotations[${i}].id must be a string`)
    if (!isString(a.type)) throw new Error(`project.annotations[${i}].type must be a string`)
  }

  return input as Project
}
