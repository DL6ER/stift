import { describe, it, expect, beforeEach } from 'vitest'
import { useProjectStore } from './projectStore'
import { RectangleAnnotation, ArrowAnnotation, CounterAnnotation, DimensionAnnotation } from '../types'

/**
 * Property-based / fuzz tests for the project store.
 * These test invariants that must hold regardless of input values.
 */
describe('property-based tests', () => {
  beforeEach(() => {
    useProjectStore.getState().clearProject()
  })

  describe('annotation count invariant', () => {
    it('adding N annotations results in exactly N annotations', () => {
      const s = useProjectStore.getState()
      const N = 50
      for (let i = 0; i < N; i++) {
        s.addAnnotation({
          id: `rect-${i}`, type: 'rectangle', x: Math.random() * 1000, y: Math.random() * 1000,
          width: Math.random() * 200 + 10, height: Math.random() * 200 + 10,
          stroke: '#ff0000', strokeWidth: Math.random() * 5 + 1,
        } as RectangleAnnotation)
      }
      expect(useProjectStore.getState().annotations).toHaveLength(N)
    })

    it('removing all annotations leaves empty array', () => {
      const s = useProjectStore.getState()
      for (let i = 0; i < 20; i++) {
        s.addAnnotation({ id: `a-${i}`, type: 'rectangle', x: 0, y: 0, width: 10, height: 10, stroke: '#f00', strokeWidth: 1 } as RectangleAnnotation)
      }
      const ids = useProjectStore.getState().annotations.map((a) => a.id)
      for (const id of ids) {
        useProjectStore.getState().removeAnnotation(id)
      }
      expect(useProjectStore.getState().annotations).toHaveLength(0)
    })
  })

  describe('layer ordering invariants', () => {
    it('reordering never changes the count', () => {
      const s = useProjectStore.getState()
      for (let i = 0; i < 20; i++) {
        s.addAnnotation({ id: `r-${i}`, type: 'rectangle', x: 0, y: 0, width: 10, height: 10, stroke: '#f00', strokeWidth: 1 } as RectangleAnnotation)
      }

      // Random reordering operations
      for (let i = 0; i < 100; i++) {
        const anns = useProjectStore.getState().annotations
        const idx = Math.floor(Math.random() * anns.length)
        const op = Math.floor(Math.random() * 4)
        const id = anns[idx].id
        switch (op) {
          case 0: useProjectStore.getState().moveAnnotationToFront(id); break
          case 1: useProjectStore.getState().moveAnnotationToBack(id); break
          case 2: useProjectStore.getState().moveAnnotationForward(id); break
          case 3: useProjectStore.getState().moveAnnotationBackward(id); break
        }
      }

      const final = useProjectStore.getState().annotations
      expect(final).toHaveLength(20)
      // All IDs still present
      const ids = new Set(final.map((a) => a.id))
      for (let i = 0; i < 20; i++) {
        expect(ids.has(`r-${i}`)).toBe(true)
      }
    })

    it('toFront always moves to last position', () => {
      const s = useProjectStore.getState()
      for (let i = 0; i < 5; i++) {
        s.addAnnotation({ id: `x-${i}`, type: 'rectangle', x: 0, y: 0, width: 10, height: 10, stroke: '#f00', strokeWidth: 1 } as RectangleAnnotation)
      }
      for (let i = 0; i < 5; i++) {
        useProjectStore.getState().moveAnnotationToFront(`x-${i}`)
        const anns = useProjectStore.getState().annotations
        expect(anns[anns.length - 1].id).toBe(`x-${i}`)
      }
    })

    it('toBack always moves to first position', () => {
      const s = useProjectStore.getState()
      for (let i = 0; i < 5; i++) {
        s.addAnnotation({ id: `y-${i}`, type: 'rectangle', x: 0, y: 0, width: 10, height: 10, stroke: '#f00', strokeWidth: 1 } as RectangleAnnotation)
      }
      for (let i = 4; i >= 0; i--) {
        useProjectStore.getState().moveAnnotationToBack(`y-${i}`)
        expect(useProjectStore.getState().annotations[0].id).toBe(`y-${i}`)
      }
    })
  })

  describe('undo/redo invariants', () => {
    it('undo followed by redo returns to same state', () => {
      const s = useProjectStore.getState()
      s.pushHistory()

      // Add some annotations
      for (let i = 0; i < 5; i++) {
        s.addAnnotation({ id: `u-${i}`, type: 'rectangle', x: i * 10, y: 0, width: 10, height: 10, stroke: '#f00', strokeWidth: 1 } as RectangleAnnotation)
      }
      s.pushHistory()

      const stateAfterAdd = JSON.stringify(useProjectStore.getState().annotations)

      useProjectStore.getState().undo()
      expect(useProjectStore.getState().annotations).toHaveLength(0)

      useProjectStore.getState().redo()
      expect(JSON.stringify(useProjectStore.getState().annotations)).toBe(stateAfterAdd)
    })

    it('multiple undo/redo cycles are stable', () => {
      const s = useProjectStore.getState()
      s.pushHistory()

      s.addAnnotation({ id: 'stable', type: 'rectangle', x: 0, y: 0, width: 100, height: 100, stroke: '#f00', strokeWidth: 2 } as RectangleAnnotation)
      s.pushHistory()

      // Undo/redo 10 times
      for (let i = 0; i < 10; i++) {
        useProjectStore.getState().undo()
        expect(useProjectStore.getState().annotations).toHaveLength(0)
        useProjectStore.getState().redo()
        expect(useProjectStore.getState().annotations).toHaveLength(1)
        expect(useProjectStore.getState().annotations[0].id).toBe('stable')
      }
    })
  })

  describe('counter auto-increment invariant', () => {
    it('counters always increment', () => {
      const s = useProjectStore.getState()
      const values: number[] = []
      for (let i = 0; i < 20; i++) {
        values.push(s.getNextCounter())
      }
      for (let i = 1; i < values.length; i++) {
        expect(values[i]).toBe(values[i - 1] + 1)
      }
    })
  })

  describe('serialization roundtrip invariant', () => {
    it('toProject/loadProject is lossless for complex state', () => {
      const s = useProjectStore.getState()
      s.setProjectMeta('Fuzz Test', 1600, 900)

      // Add images
      s.addImage({ data: 'data:image/png;base64,a', name: 'img1.png', x: 10, y: 20, width: 400, height: 300, naturalWidth: 800, naturalHeight: 600, role: 'overview', rotation: 30, locked: true, cropX: 50, cropY: 25, cropWidth: 700, cropHeight: 550 })
      s.addImage({ data: 'data:image/png;base64,b', name: 'img2.png', x: 500, y: 20, width: 200, height: 150, naturalWidth: 400, naturalHeight: 300, role: 'detail' })

      // Add diverse annotations
      s.addAnnotation({ id: 'arr', type: 'arrow', x: 0, y: 0, points: [100, 100, 200, 200], stroke: '#f00', strokeWidth: 3, headSize: 10 } as ArrowAnnotation)
      s.addAnnotation({ id: 'ctr', type: 'counter', x: 300, y: 300, number: 42, fill: '#00f', textColor: '#fff', radius: 20, fontSize: 16 } as CounterAnnotation)
      s.addAnnotation({ id: 'dim', type: 'dimension', x: 0, y: 0, points: [0, 500, 400, 500], stroke: '#000', strokeWidth: 1.5, fontSize: 12, label: '25 cm', unit: 'cm', pixelsPerUnit: 16, capSize: 8 } as DimensionAnnotation)

      // Add ROIs and connectors
      const roi = s.addROI({ imageId: useProjectStore.getState().images[0].id, x: 100, y: 100, width: 80, height: 60 })
      s.addConnector({ fromRoiId: roi.id, toImageId: useProjectStore.getState().images[1].id, color: roi.color, strokeWidth: 3, style: 'curved' })

      // Serialize
      const project = s.toProject()
      const json = JSON.stringify(project)

      // Clear and reload
      s.clearProject()
      expect(useProjectStore.getState().images).toHaveLength(0)
      expect(useProjectStore.getState().annotations).toHaveLength(0)

      s.loadProject(JSON.parse(json))

      const loaded = useProjectStore.getState()
      expect(loaded.projectName).toBe('Fuzz Test')
      expect(loaded.canvasWidth).toBe(1600)
      expect(loaded.images).toHaveLength(2)
      expect(loaded.images[0].rotation).toBe(30)
      expect(loaded.images[0].locked).toBe(true)
      expect(loaded.images[0].cropX).toBe(50)
      expect(loaded.annotations).toHaveLength(3)
      expect(loaded.rois).toHaveLength(1)
      expect(loaded.connectors).toHaveLength(1)
      expect(loaded.connectors[0].style).toBe('curved')
      expect(loaded.connectors[0].strokeWidth).toBe(3)

      // Re-serialize should produce identical JSON
      const project2 = loaded.toProject()
      expect(JSON.stringify(project2)).toBe(json)
    })
  })

  describe('update idempotency', () => {
    it('updating annotation with same values produces identical state', () => {
      const s = useProjectStore.getState()
      s.addAnnotation({ id: 'idem', type: 'rectangle', x: 50, y: 50, width: 100, height: 100, stroke: '#f00', strokeWidth: 2, cornerRadius: 6 } as RectangleAnnotation)

      const before = JSON.stringify(useProjectStore.getState().annotations[0])
      s.updateAnnotation('idem', { x: 50, width: 100 })
      const after = JSON.stringify(useProjectStore.getState().annotations[0])
      expect(after).toBe(before)
    })

    it('updating image with same values produces identical state', () => {
      const id = useProjectStore.getState().addImage({ data: 'data:image/png;base64,x', name: 't.png', x: 10, y: 10, width: 100, height: 100, naturalWidth: 100, naturalHeight: 100, role: 'standalone' })

      const before = JSON.stringify(useProjectStore.getState().images[0])
      useProjectStore.getState().updateImage(id, { x: 10, width: 100 })
      const after = JSON.stringify(useProjectStore.getState().images[0])
      expect(after).toBe(before)
    })
  })
})
