import { describe, it, expect } from 'vitest'
import { ROI_COLORS, DEFAULT_STROKE_COLOR, DEFAULT_STROKE_WIDTH, DEFAULT_FONT_SIZE, DEFAULT_BLUR_PIXEL_SIZE, DEFAULT_COUNTER_RADIUS } from './types'

describe('type constants', () => {
  it('should have 12 ROI colors', () => {
    expect(ROI_COLORS).toHaveLength(12)
  })

  it('should have valid hex colors in ROI_COLORS', () => {
    ROI_COLORS.forEach((color) => {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i)
    })
  })

  it('should have all unique ROI colors', () => {
    const unique = new Set(ROI_COLORS)
    expect(unique.size).toBe(ROI_COLORS.length)
  })

  it('should have sensible defaults', () => {
    expect(DEFAULT_STROKE_COLOR).toMatch(/^#[0-9a-f]{6}$/i)
    expect(DEFAULT_STROKE_WIDTH).toBeGreaterThan(0)
    expect(DEFAULT_FONT_SIZE).toBeGreaterThan(0)
    expect(DEFAULT_BLUR_PIXEL_SIZE).toBeGreaterThan(0)
    expect(DEFAULT_COUNTER_RADIUS).toBeGreaterThan(0)
  })
})
