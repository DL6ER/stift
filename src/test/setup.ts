/// <reference types="vitest/globals" />
import '@testing-library/jest-dom'

// Mock Konva for jsdom (Konva requires a real canvas)
vi.mock('konva', () => {
  const Stage = vi.fn().mockImplementation(() => ({
    toDataURL: vi.fn(() => 'data:image/png;base64,mock'),
    getPointerPosition: vi.fn(() => ({ x: 0, y: 0 })),
    findOne: vi.fn(),
    find: vi.fn(() => []),
    destroy: vi.fn(),
    add: vi.fn(),
    draw: vi.fn(),
    batchDraw: vi.fn(),
    width: vi.fn(() => 800),
    height: vi.fn(() => 600),
  }))
  return { default: { Stage } }
})

// Mock react-konva components
vi.mock('react-konva', () => ({
  Stage: vi.fn(({ children }: any) => children),
  Layer: vi.fn(({ children }: any) => children),
  Rect: vi.fn(() => null),
  Circle: vi.fn(() => null),
  Ellipse: vi.fn(() => null),
  Line: vi.fn(() => null),
  Arrow: vi.fn(() => null),
  Text: vi.fn(() => null),
  Group: vi.fn(({ children }: any) => children),
  Image: vi.fn(() => null),
  Transformer: vi.fn(() => null),
}))

// Mock window.Image
class MockImage {
  onload: (() => void) | null = null
  src = ''
  width = 100
  height = 100
  constructor() {
    setTimeout(() => this.onload?.(), 0)
  }
}
Object.defineProperty(globalThis, 'Image', { value: MockImage })
