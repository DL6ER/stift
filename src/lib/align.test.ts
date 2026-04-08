import { describe, it, expect, beforeEach } from 'vitest'
import { useProjectStore } from '../stores/projectStore'
import { RectangleAnnotation } from '../types'
import { alignLeft, alignRight, alignTop, alignBottom, alignCenterH, alignCenterV, distributeH, distributeV } from './align'

function addRect(id: string, x: number, y: number, w: number, h: number) {
  useProjectStore.getState().addAnnotation({
    id, type: 'rectangle', x, y, width: w, height: h, stroke: '#f00', strokeWidth: 1,
  } as RectangleAnnotation)
}

describe('alignment tools', () => {
  beforeEach(() => useProjectStore.getState().clearProject())

  it('alignLeft aligns to leftmost edge', () => {
    addRect('a', 100, 50, 40, 40)
    addRect('b', 200, 80, 40, 40)
    addRect('c', 50, 30, 40, 40)
    alignLeft(['a', 'b', 'c'])
    const anns = useProjectStore.getState().annotations
    expect(anns.every((a) => a.x === 50)).toBe(true)
  })

  it('alignRight aligns to rightmost edge', () => {
    addRect('a', 100, 50, 40, 40)
    addRect('b', 200, 80, 60, 40)
    alignRight(['a', 'b'])
    const anns = useProjectStore.getState().annotations as RectangleAnnotation[]
    const rightEdges = anns.map((a) => a.x + a.width)
    expect(rightEdges[0]).toBe(rightEdges[1])
    expect(rightEdges[0]).toBe(260) // max right edge
  })

  it('alignTop aligns to topmost edge', () => {
    addRect('a', 100, 50, 40, 40)
    addRect('b', 200, 80, 40, 40)
    alignTop(['a', 'b'])
    const anns = useProjectStore.getState().annotations
    expect(anns.every((a) => a.y === 50)).toBe(true)
  })

  it('alignBottom aligns to bottommost edge', () => {
    addRect('a', 100, 50, 40, 60)
    addRect('b', 200, 80, 40, 40)
    alignBottom(['a', 'b'])
    const anns = useProjectStore.getState().annotations as RectangleAnnotation[]
    const bottomEdges = anns.map((a) => a.y + a.height)
    expect(bottomEdges[0]).toBe(bottomEdges[1])
  })

  it('alignCenterH centers horizontally', () => {
    addRect('a', 0, 0, 100, 40)
    addRect('b', 200, 0, 50, 40)
    alignCenterH(['a', 'b'])
    const anns = useProjectStore.getState().annotations as RectangleAnnotation[]
    const centers = anns.map((a) => a.x + a.width / 2)
    expect(Math.abs(centers[0] - centers[1])).toBeLessThan(1)
  })

  it('alignCenterV centers vertically', () => {
    addRect('a', 0, 0, 40, 100)
    addRect('b', 0, 200, 40, 50)
    alignCenterV(['a', 'b'])
    const anns = useProjectStore.getState().annotations as RectangleAnnotation[]
    const centers = anns.map((a) => a.y + a.height / 2)
    expect(Math.abs(centers[0] - centers[1])).toBeLessThan(1)
  })

  it('distributeH distributes evenly horizontally', () => {
    addRect('a', 0, 0, 20, 20)
    addRect('b', 100, 0, 20, 20)
    addRect('c', 200, 0, 20, 20)
    distributeH(['a', 'b', 'c'])
    const anns = useProjectStore.getState().annotations as RectangleAnnotation[]
    anns.sort((a, b) => a.x - b.x)
    const gap1 = anns[1].x - (anns[0].x + anns[0].width)
    const gap2 = anns[2].x - (anns[1].x + anns[1].width)
    expect(Math.abs(gap1 - gap2)).toBeLessThan(1)
  })

  it('distributeV distributes evenly vertically', () => {
    addRect('a', 0, 0, 20, 20)
    addRect('b', 0, 100, 20, 20)
    addRect('c', 0, 200, 20, 20)
    distributeV(['a', 'b', 'c'])
    const anns = useProjectStore.getState().annotations as RectangleAnnotation[]
    anns.sort((a, b) => a.y - b.y)
    const gap1 = anns[1].y - (anns[0].y + anns[0].height)
    const gap2 = anns[2].y - (anns[1].y + anns[1].height)
    expect(Math.abs(gap1 - gap2)).toBeLessThan(1)
  })

  it('does nothing with fewer than 2 elements', () => {
    addRect('a', 100, 50, 40, 40)
    alignLeft(['a'])
    expect(useProjectStore.getState().annotations[0].x).toBe(100)
  })
})
