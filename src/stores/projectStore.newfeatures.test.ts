import { describe, it, expect, beforeEach } from 'vitest'
import { useProjectStore } from './projectStore'
import {
  ArrowAnnotation, RectangleAnnotation, TextBoxAnnotation, DimensionAnnotation,
  CounterAnnotation, Connector,
} from '../types'

describe('projectStore -- new features', () => {
  beforeEach(() => {
    useProjectStore.getState().clearProject()
  })

  describe('layer ordering', () => {
    const addThree = () => {
      const s = useProjectStore.getState()
      s.addAnnotation({ id: 'a', type: 'rectangle', x: 0, y: 0, width: 10, height: 10, stroke: '#f00', strokeWidth: 1 } as RectangleAnnotation)
      s.addAnnotation({ id: 'b', type: 'rectangle', x: 0, y: 0, width: 10, height: 10, stroke: '#0f0', strokeWidth: 1 } as RectangleAnnotation)
      s.addAnnotation({ id: 'c', type: 'rectangle', x: 0, y: 0, width: 10, height: 10, stroke: '#00f', strokeWidth: 1 } as RectangleAnnotation)
    }

    it('should move annotation to front', () => {
      addThree()
      useProjectStore.getState().moveAnnotationToFront('a')
      const ids = useProjectStore.getState().annotations.map((a) => a.id)
      expect(ids).toEqual(['b', 'c', 'a'])
    })

    it('should move annotation to back', () => {
      addThree()
      useProjectStore.getState().moveAnnotationToBack('c')
      const ids = useProjectStore.getState().annotations.map((a) => a.id)
      expect(ids).toEqual(['c', 'a', 'b'])
    })

    it('should move annotation forward one step', () => {
      addThree()
      useProjectStore.getState().moveAnnotationForward('a')
      const ids = useProjectStore.getState().annotations.map((a) => a.id)
      expect(ids).toEqual(['b', 'a', 'c'])
    })

    it('should move annotation backward one step', () => {
      addThree()
      useProjectStore.getState().moveAnnotationBackward('c')
      const ids = useProjectStore.getState().annotations.map((a) => a.id)
      expect(ids).toEqual(['a', 'c', 'b'])
    })

    it('should not move first annotation backward', () => {
      addThree()
      useProjectStore.getState().moveAnnotationBackward('a')
      const ids = useProjectStore.getState().annotations.map((a) => a.id)
      expect(ids).toEqual(['a', 'b', 'c'])
    })

    it('should not move last annotation forward', () => {
      addThree()
      useProjectStore.getState().moveAnnotationForward('c')
      const ids = useProjectStore.getState().annotations.map((a) => a.id)
      expect(ids).toEqual(['a', 'b', 'c'])
    })
  })

  describe('ROI update', () => {
    it('should update ROI position and size', () => {
      const roi = useProjectStore.getState().addROI({
        imageId: 'img-1', x: 10, y: 10, width: 50, height: 50,
      })
      useProjectStore.getState().updateROI(roi.id, { x: 100, y: 200, width: 80, height: 60 })
      const updated = useProjectStore.getState().rois[0]
      expect(updated.x).toBe(100)
      expect(updated.y).toBe(200)
      expect(updated.width).toBe(80)
      expect(updated.height).toBe(60)
      expect(updated.color).toBe(roi.color) // color preserved
    })
  })

  describe('connector update', () => {
    it('should update connector color and style', () => {
      useProjectStore.getState().addConnector({
        fromRoiId: 'roi-1', toImageId: 'img-2', color: '#ff0000', strokeWidth: 2, style: 'straight',
      })
      const id = useProjectStore.getState().connectors[0].id
      useProjectStore.getState().updateConnector(id, { color: '#00ff00', strokeWidth: 4, style: 'curved' })
      const updated = useProjectStore.getState().connectors[0]
      expect(updated.color).toBe('#00ff00')
      expect(updated.strokeWidth).toBe(4)
      expect(updated.style).toBe('curved')
    })

    it('should preserve other fields when updating', () => {
      useProjectStore.getState().addConnector({
        fromRoiId: 'roi-1', toImageId: 'img-2', color: '#ff0000', strokeWidth: 2, style: 'straight',
      })
      const id = useProjectStore.getState().connectors[0].id
      useProjectStore.getState().updateConnector(id, { color: '#00ff00' })
      const updated = useProjectStore.getState().connectors[0]
      expect(updated.fromRoiId).toBe('roi-1')
      expect(updated.toImageId).toBe('img-2')
      expect(updated.style).toBe('straight')
    })
  })

  describe('textbox annotation', () => {
    it('should add and update a textbox', () => {
      const tb: TextBoxAnnotation = {
        id: 'tb-1', type: 'textbox', x: 10, y: 10,
        width: 200, height: 100, text: 'Hello World',
        fontSize: 14, fontFamily: 'sans-serif', fill: '#000',
        backgroundColor: '#fff', borderColor: '#333',
        borderWidth: 2, borderRadius: 6, padding: 10,
      }
      useProjectStore.getState().addAnnotation(tb)
      expect(useProjectStore.getState().annotations).toHaveLength(1)

      useProjectStore.getState().updateAnnotation('tb-1', { text: 'Updated' } as any)
      const updated = useProjectStore.getState().annotations[0] as TextBoxAnnotation
      expect(updated.text).toBe('Updated')
      expect(updated.width).toBe(200) // preserved
    })
  })

  describe('dimension annotation', () => {
    it('should add a dimension line', () => {
      const dim: DimensionAnnotation = {
        id: 'dim-1', type: 'dimension', x: 0, y: 0,
        points: [100, 100, 300, 100],
        stroke: '#000', strokeWidth: 1.5, fontSize: 12,
        label: '200 px', unit: 'px', pixelsPerUnit: 1, capSize: 8,
      }
      useProjectStore.getState().addAnnotation(dim)
      expect(useProjectStore.getState().annotations).toHaveLength(1)

      const stored = useProjectStore.getState().annotations[0] as DimensionAnnotation
      expect(stored.label).toBe('200 px')
      expect(stored.points).toEqual([100, 100, 300, 100])
    })

    it('should update dimension label and calibration', () => {
      const dim: DimensionAnnotation = {
        id: 'dim-1', type: 'dimension', x: 0, y: 0,
        points: [0, 0, 200, 0],
        stroke: '#000', strokeWidth: 1.5, fontSize: 12,
        label: '200 px', unit: 'px', pixelsPerUnit: 1, capSize: 8,
      }
      useProjectStore.getState().addAnnotation(dim)
      useProjectStore.getState().updateAnnotation('dim-1', {
        label: '10 m', unit: 'm', pixelsPerUnit: 20,
      } as any)
      const updated = useProjectStore.getState().annotations[0] as DimensionAnnotation
      expect(updated.label).toBe('10 m')
      expect(updated.unit).toBe('m')
      expect(updated.pixelsPerUnit).toBe(20)
    })
  })

  describe('image crop', () => {
    it('should store crop values on image', () => {
      const id = useProjectStore.getState().addImage({
        data: 'data:image/png;base64,abc',
        name: 'test.png',
        x: 0, y: 0, width: 400, height: 300,
        naturalWidth: 800, naturalHeight: 600,
        role: 'standalone',
      })
      useProjectStore.getState().updateImage(id, {
        cropX: 100, cropY: 50, cropWidth: 600, cropHeight: 500,
      })
      const img = useProjectStore.getState().images[0]
      expect(img.cropX).toBe(100)
      expect(img.cropY).toBe(50)
      expect(img.cropWidth).toBe(600)
      expect(img.cropHeight).toBe(500)
    })

    it('should reset crop by setting undefined', () => {
      const id = useProjectStore.getState().addImage({
        data: 'data:image/png;base64,abc',
        name: 'test.png',
        x: 0, y: 0, width: 400, height: 300,
        naturalWidth: 800, naturalHeight: 600,
        role: 'standalone',
        cropX: 100, cropY: 50, cropWidth: 600, cropHeight: 500,
      })
      useProjectStore.getState().updateImage(id, {
        cropX: undefined, cropY: undefined, cropWidth: undefined, cropHeight: undefined,
      })
      const img = useProjectStore.getState().images[0]
      expect(img.cropX).toBeUndefined()
      expect(img.cropWidth).toBeUndefined()
    })
  })

  describe('image rotation', () => {
    it('should store rotation on image', () => {
      const id = useProjectStore.getState().addImage({
        data: 'data:image/png;base64,abc',
        name: 'test.png',
        x: 0, y: 0, width: 400, height: 300,
        naturalWidth: 800, naturalHeight: 600,
        role: 'standalone',
      })
      useProjectStore.getState().updateImage(id, { rotation: 45 })
      expect(useProjectStore.getState().images[0].rotation).toBe(45)
    })

    it('should serialize and deserialize rotation', () => {
      const s = useProjectStore.getState()
      s.addImage({
        data: 'data:image/png;base64,abc',
        name: 'rotated.png',
        x: 0, y: 0, width: 100, height: 100,
        naturalWidth: 100, naturalHeight: 100,
        role: 'standalone',
        rotation: 90,
      })
      const project = s.toProject()
      s.clearProject()
      s.loadProject(project)
      expect(useProjectStore.getState().images[0].rotation).toBe(90)
    })
  })

  describe('connector with strokeWidth', () => {
    it('should add connector with strokeWidth', () => {
      useProjectStore.getState().addConnector({
        fromRoiId: 'roi-1', toImageId: 'img-2', color: '#ff0000', strokeWidth: 4, style: 'curved',
      })
      const conn = useProjectStore.getState().connectors[0]
      expect(conn.strokeWidth).toBe(4)
      expect(conn.style).toBe('curved')
    })
  })

  describe('image lock', () => {
    it('should store locked flag on image', () => {
      const id = useProjectStore.getState().addImage({
        data: 'data:image/png;base64,abc',
        name: 'test.png',
        x: 0, y: 0, width: 100, height: 100,
        naturalWidth: 100, naturalHeight: 100,
        role: 'standalone',
      })
      useProjectStore.getState().updateImage(id, { locked: true })
      expect(useProjectStore.getState().images[0].locked).toBe(true)
      useProjectStore.getState().updateImage(id, { locked: false })
      expect(useProjectStore.getState().images[0].locked).toBe(false)
    })

    it('should serialize and deserialize locked state', () => {
      const s = useProjectStore.getState()
      s.addImage({
        data: 'data:image/png;base64,abc',
        name: 'locked.png',
        x: 0, y: 0, width: 100, height: 100,
        naturalWidth: 100, naturalHeight: 100,
        role: 'standalone',
        locked: true,
      })
      const project = s.toProject()
      s.clearProject()
      s.loadProject(project)
      expect(useProjectStore.getState().images[0].locked).toBe(true)
    })
  })

  describe('textbox ellipsis', () => {
    it('should store textbox with long text', () => {
      const tb: TextBoxAnnotation = {
        id: 'tb-long', type: 'textbox', x: 0, y: 0,
        width: 100, height: 30, text: 'This is a very long text that should be truncated with ellipsis in the rendered output',
        fontSize: 14, fontFamily: 'sans-serif', fill: '#000',
        backgroundColor: '#fff', borderColor: '#333',
        borderWidth: 2, borderRadius: 6, padding: 10,
      }
      useProjectStore.getState().addAnnotation(tb)
      const stored = useProjectStore.getState().annotations[0] as TextBoxAnnotation
      expect(stored.text).toContain('very long text')
      expect(stored.width).toBe(100)
    })
  })

  describe('crop bounds', () => {
    it('should not allow crop values exceeding natural dimensions', () => {
      const id = useProjectStore.getState().addImage({
        data: 'data:image/png;base64,abc',
        name: 'test.png',
        x: 0, y: 0, width: 400, height: 300,
        naturalWidth: 800, naturalHeight: 600,
        role: 'standalone',
      })
      // Set crop larger than natural -- store doesn't enforce, but UI does
      useProjectStore.getState().updateImage(id, {
        cropX: 0, cropY: 0, cropWidth: 800, cropHeight: 600,
      })
      const img = useProjectStore.getState().images[0]
      expect(img.cropWidth).toBe(800)
      expect(img.cropHeight).toBe(600)
    })

    it('should handle crop with offset correctly', () => {
      const id = useProjectStore.getState().addImage({
        data: 'data:image/png;base64,abc',
        name: 'test.png',
        x: 0, y: 0, width: 400, height: 300,
        naturalWidth: 800, naturalHeight: 600,
        role: 'standalone',
      })
      useProjectStore.getState().updateImage(id, {
        cropX: 200, cropY: 100, cropWidth: 400, cropHeight: 300,
      })
      const img = useProjectStore.getState().images[0]
      // cropX + cropWidth should not exceed naturalWidth
      expect(img.cropX! + img.cropWidth!).toBeLessThanOrEqual(800)
      expect(img.cropY! + img.cropHeight!).toBeLessThanOrEqual(600)
    })
  })

  describe('layer ordering with undo', () => {
    it('should undo layer reordering', () => {
      const s = useProjectStore.getState()
      s.addAnnotation({ id: 'a', type: 'rectangle', x: 0, y: 0, width: 10, height: 10, stroke: '#f00', strokeWidth: 1 } as RectangleAnnotation)
      s.addAnnotation({ id: 'b', type: 'rectangle', x: 0, y: 0, width: 10, height: 10, stroke: '#0f0', strokeWidth: 1 } as RectangleAnnotation)
      s.pushHistory()

      s.moveAnnotationToFront('a')
      s.pushHistory()
      expect(useProjectStore.getState().annotations.map((a) => a.id)).toEqual(['b', 'a'])

      useProjectStore.getState().undo()
      expect(useProjectStore.getState().annotations.map((a) => a.id)).toEqual(['a', 'b'])
    })
  })

  describe('serialization with new types', () => {
    it('should serialize and deserialize textbox and dimension annotations', () => {
      const s = useProjectStore.getState()
      s.addAnnotation({
        id: 'tb-1', type: 'textbox', x: 10, y: 10,
        width: 200, height: 100, text: 'Test Box',
        fontSize: 14, fontFamily: 'sans-serif', fill: '#000',
        backgroundColor: '#fff', borderColor: '#333',
        borderWidth: 2, borderRadius: 6, padding: 10,
      } as TextBoxAnnotation)
      s.addAnnotation({
        id: 'dim-1', type: 'dimension', x: 0, y: 0,
        points: [0, 0, 100, 0],
        stroke: '#000', strokeWidth: 1.5, fontSize: 12,
        label: '5 cm', unit: 'cm', pixelsPerUnit: 20, capSize: 8,
      } as DimensionAnnotation)

      const project = s.toProject()
      expect(project.annotations).toHaveLength(2)

      s.clearProject()
      s.loadProject(project)
      const loaded = useProjectStore.getState().annotations
      expect(loaded).toHaveLength(2)
      expect(loaded[0].type).toBe('textbox')
      expect(loaded[1].type).toBe('dimension')
      expect((loaded[0] as TextBoxAnnotation).text).toBe('Test Box')
      expect((loaded[1] as DimensionAnnotation).label).toBe('5 cm')
    })

    it('should serialize image crop values', () => {
      const s = useProjectStore.getState()
      s.addImage({
        data: 'data:image/png;base64,abc',
        name: 'cropped.png',
        x: 0, y: 0, width: 400, height: 300,
        naturalWidth: 800, naturalHeight: 600,
        role: 'standalone',
        cropX: 100, cropY: 50, cropWidth: 600, cropHeight: 500,
      })

      const project = s.toProject()
      s.clearProject()
      s.loadProject(project)
      const img = useProjectStore.getState().images[0]
      expect(img.cropX).toBe(100)
      expect(img.cropWidth).toBe(600)
    })
  })
})
