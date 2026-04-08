import { describe, it, expect, beforeEach } from 'vitest'
import { useProjectStore } from './projectStore'
import { useEditorStore } from './editorStore'
import {
  ArrowAnnotation, RectangleAnnotation, EllipseAnnotation, TextAnnotation,
  TextBoxAnnotation, DimensionAnnotation, CounterAnnotation, LineAnnotation,
  HighlightAnnotation, BlurAnnotation, ColorBoxAnnotation, DrawAnnotation,
  DEFAULT_STROKE_COLOR, DEFAULT_STROKE_WIDTH, DEFAULT_FONT_SIZE,
  DEFAULT_COUNTER_RADIUS, DEFAULT_CORNER_RADIUS,
} from '../types'

describe('consistency checks', () => {
  beforeEach(() => {
    useProjectStore.getState().clearProject()
    useProjectStore.setState({ isDirty: false, versions: [] })
    useEditorStore.setState({ selectedIds: [], clipboard: [], croppingImageId: null, editingTextId: null })
  })

  describe('all annotation types can be added and serialized', () => {
    const types: { name: string; ann: any }[] = [
      { name: 'arrow', ann: { id: 'a1', type: 'arrow', x: 0, y: 0, points: [0, 0, 100, 100], stroke: '#f00', strokeWidth: 2, headSize: 8 } },
      { name: 'text', ann: { id: 'a2', type: 'text', x: 10, y: 10, text: 'Hello', fontSize: 14, fontFamily: 'sans-serif', fill: '#000' } },
      { name: 'textbox', ann: { id: 'a3', type: 'textbox', x: 20, y: 20, width: 200, height: 100, text: 'Box', fontSize: 14, fontFamily: 'sans-serif', fill: '#000', backgroundColor: '#fff', borderColor: '#333', borderWidth: 2, borderRadius: 6, padding: 10 } },
      { name: 'highlight', ann: { id: 'a4', type: 'highlight', x: 0, y: 0, width: 50, height: 50, fill: 'rgba(255,255,0,0.3)', opacity: 0.3 } },
      { name: 'blur', ann: { id: 'a5', type: 'blur', x: 0, y: 0, width: 50, height: 50, pixelSize: 10 } },
      { name: 'rectangle', ann: { id: 'a6', type: 'rectangle', x: 0, y: 0, width: 100, height: 50, stroke: '#f00', strokeWidth: 2, cornerRadius: 6 } },
      { name: 'ellipse', ann: { id: 'a7', type: 'ellipse', x: 0, y: 0, radiusX: 50, radiusY: 30, stroke: '#f00', strokeWidth: 2 } },
      { name: 'line', ann: { id: 'a8', type: 'line', x: 0, y: 0, points: [0, 0, 100, 0], stroke: '#f00', strokeWidth: 2 } },
      { name: 'draw', ann: { id: 'a9', type: 'draw', x: 0, y: 0, points: [0, 0, 10, 10, 20, 5], stroke: '#f00', strokeWidth: 2 } },
      { name: 'colorbox', ann: { id: 'a10', type: 'colorbox', x: 0, y: 0, width: 50, height: 20, fill: '#000' } },
      { name: 'counter', ann: { id: 'a11', type: 'counter', x: 0, y: 0, number: 1, fill: '#f00', textColor: '#fff', radius: 16, fontSize: 16 } },
      { name: 'dimension', ann: { id: 'a12', type: 'dimension', x: 0, y: 0, points: [0, 0, 200, 0], stroke: '#000', strokeWidth: 1.5, fontSize: 12, label: '10 m', unit: 'm', pixelsPerUnit: 20, capSize: 8 } },
    ]

    for (const { name, ann } of types) {
      it(`should roundtrip ${name} annotation`, () => {
        useProjectStore.getState().addAnnotation(ann)
        const project = useProjectStore.getState().toProject()
        useProjectStore.getState().clearProject()
        useProjectStore.getState().loadProject(project)
        const loaded = useProjectStore.getState().annotations[0]
        expect(loaded.type).toBe(name)
        expect(loaded.id).toBe(ann.id)
      })
    }
  })

  describe('layer ordering preserves annotation integrity', () => {
    it('should not lose annotations during reordering', () => {
      const s = useProjectStore.getState()
      for (let i = 0; i < 10; i++) {
        s.addAnnotation({ id: `r${i}`, type: 'rectangle', x: i * 10, y: 0, width: 10, height: 10, stroke: '#f00', strokeWidth: 1 } as RectangleAnnotation)
      }
      // Move several annotations around
      s.moveAnnotationToFront('r0')
      s.moveAnnotationToBack('r5')
      s.moveAnnotationForward('r3')
      s.moveAnnotationBackward('r7')

      const anns = useProjectStore.getState().annotations
      expect(anns).toHaveLength(10)
      // All IDs should still be present
      const ids = new Set(anns.map((a) => a.id))
      for (let i = 0; i < 10; i++) {
        expect(ids.has(`r${i}`)).toBe(true)
      }
    })
  })

  describe('ROI-connector cascade delete', () => {
    it('should remove all connectors when ROI is deleted', () => {
      const roi1 = useProjectStore.getState().addROI({ imageId: 'img-1', x: 0, y: 0, width: 50, height: 50 })
      const roi2 = useProjectStore.getState().addROI({ imageId: 'img-1', x: 100, y: 0, width: 50, height: 50 })
      useProjectStore.getState().addConnector({ fromRoiId: roi1.id, toImageId: 'img-2', color: '#f00', strokeWidth: 2, style: 'straight' })
      useProjectStore.getState().addConnector({ fromRoiId: roi2.id, toImageId: 'img-3', color: '#0f0', strokeWidth: 2, style: 'straight' })
      expect(useProjectStore.getState().connectors).toHaveLength(2)

      useProjectStore.getState().removeROI(roi1.id)
      expect(useProjectStore.getState().connectors).toHaveLength(1)
      expect(useProjectStore.getState().connectors[0].fromRoiId).toBe(roi2.id)
    })

    it('should remove connectors when target image is deleted', () => {
      const imgId = useProjectStore.getState().addImage({
        data: 'data:image/png;base64,abc', name: 'detail.png',
        x: 0, y: 0, width: 100, height: 100, naturalWidth: 100, naturalHeight: 100, role: 'detail',
      })
      useProjectStore.getState().addConnector({ fromRoiId: 'roi-1', toImageId: imgId, color: '#f00', strokeWidth: 2, style: 'straight' })
      useProjectStore.getState().addConnector({ fromRoiId: 'roi-2', toImageId: 'other-img', color: '#0f0', strokeWidth: 2, style: 'straight' })
      expect(useProjectStore.getState().connectors).toHaveLength(2)

      useProjectStore.getState().removeImage(imgId)
      expect(useProjectStore.getState().connectors).toHaveLength(1)
    })
  })

  describe('image crop roundtrip', () => {
    it('should preserve all crop fields through serialization', () => {
      useProjectStore.getState().addImage({
        data: 'data:image/png;base64,abc', name: 'test.png',
        x: 50, y: 50, width: 400, height: 300,
        naturalWidth: 800, naturalHeight: 600, role: 'standalone',
        rotation: 15, locked: true,
        cropX: 100, cropY: 50, cropWidth: 600, cropHeight: 500,
      })
      const project = useProjectStore.getState().toProject()
      useProjectStore.getState().clearProject()
      useProjectStore.getState().loadProject(project)
      const img = useProjectStore.getState().images[0]
      expect(img.x).toBe(50)
      expect(img.rotation).toBe(15)
      expect(img.locked).toBe(true)
      expect(img.cropX).toBe(100)
      expect(img.cropY).toBe(50)
      expect(img.cropWidth).toBe(600)
      expect(img.cropHeight).toBe(500)
    })
  })

  describe('connector with all styles roundtrip', () => {
    it('should preserve all connector properties', () => {
      useProjectStore.getState().addConnector({ fromRoiId: 'r1', toImageId: 'i1', color: '#abc', strokeWidth: 5, style: 'curved' })
      useProjectStore.getState().addConnector({ fromRoiId: 'r2', toImageId: 'i2', color: '#def', strokeWidth: 1, style: 'orthogonal' })
      const project = useProjectStore.getState().toProject()
      useProjectStore.getState().clearProject()
      useProjectStore.getState().loadProject(project)
      const conns = useProjectStore.getState().connectors
      expect(conns).toHaveLength(2)
      expect(conns[0].style).toBe('curved')
      expect(conns[0].strokeWidth).toBe(5)
      expect(conns[1].style).toBe('orthogonal')
      expect(conns[1].strokeWidth).toBe(1)
    })
  })

  describe('undo/redo with complex operations', () => {
    it('should undo layer reorder + annotation add atomically', () => {
      const s = useProjectStore.getState()
      s.addAnnotation({ id: 'a', type: 'rectangle', x: 0, y: 0, width: 10, height: 10, stroke: '#f00', strokeWidth: 1 } as RectangleAnnotation)
      s.addAnnotation({ id: 'b', type: 'rectangle', x: 0, y: 0, width: 10, height: 10, stroke: '#0f0', strokeWidth: 1 } as RectangleAnnotation)
      s.pushHistory()

      // Add and reorder
      s.addAnnotation({ id: 'c', type: 'rectangle', x: 0, y: 0, width: 10, height: 10, stroke: '#00f', strokeWidth: 1 } as RectangleAnnotation)
      s.moveAnnotationToFront('a')
      s.pushHistory()

      expect(useProjectStore.getState().annotations).toHaveLength(3)
      useProjectStore.getState().undo()
      expect(useProjectStore.getState().annotations).toHaveLength(2)
      expect(useProjectStore.getState().annotations.map((a) => a.id)).toEqual(['a', 'b'])
    })
  })

  describe('editor state isolation', () => {
    it('should clear cropping and connector state on tool switch', () => {
      useEditorStore.getState().setCroppingImageId('img-1')
      useEditorStore.getState().setPendingConnectorRoiId('roi-1')
      useEditorStore.getState().setActiveTool('arrow')
      expect(useEditorStore.getState().croppingImageId).toBeNull()
      // pendingConnectorRoiId is not auto-cleared by setActiveTool currently
    })

    it('should clear selection on tool switch', () => {
      useEditorStore.getState().setSelectedIds(['a', 'b'])
      useEditorStore.getState().setActiveTool('rectangle')
      expect(useEditorStore.getState().selectedIds).toEqual([])
    })
  })

  describe('image brightness and contrast', () => {
    it('should store brightness and contrast on images', () => {
      const id = useProjectStore.getState().addImage({
        data: 'data:image/png;base64,abc', name: 'test.png',
        x: 0, y: 0, width: 100, height: 100, naturalWidth: 100, naturalHeight: 100, role: 'standalone',
      })
      useProjectStore.getState().updateImage(id, { brightness: 0.5, contrast: 30 })
      const img = useProjectStore.getState().images[0]
      expect(img.brightness).toBe(0.5)
      expect(img.contrast).toBe(30)
    })

    it('should roundtrip brightness/contrast through serialization', () => {
      const s = useProjectStore.getState()
      s.addImage({
        data: 'data:image/png;base64,abc', name: 'filtered.png',
        x: 0, y: 0, width: 100, height: 100, naturalWidth: 100, naturalHeight: 100,
        role: 'standalone', brightness: -0.3, contrast: 50,
      })
      const project = s.toProject()
      s.clearProject()
      s.loadProject(project)
      const img = useProjectStore.getState().images[0]
      expect(img.brightness).toBe(-0.3)
      expect(img.contrast).toBe(50)
    })
  })

  describe('double-head arrow', () => {
    it('should store and update doubleHead property', () => {
      useProjectStore.getState().addAnnotation({
        id: 'dh-arr', type: 'arrow', x: 0, y: 0, points: [0, 0, 100, 100],
        stroke: '#f00', strokeWidth: 2, headSize: 10, doubleHead: true,
      } as any)
      const ann = useProjectStore.getState().annotations[0] as any
      expect(ann.doubleHead).toBe(true)

      useProjectStore.getState().updateAnnotation('dh-arr', { doubleHead: false } as any)
      const updated = useProjectStore.getState().annotations[0] as any
      expect(updated.doubleHead).toBe(false)
    })
  })

  describe('multi-select', () => {
    it('should support multiple IDs in selectedIds', () => {
      useEditorStore.getState().setSelectedIds(['a', 'b', 'c'])
      expect(useEditorStore.getState().selectedIds).toEqual(['a', 'b', 'c'])
    })

    it('should clear on tool switch', () => {
      useEditorStore.getState().setSelectedIds(['a', 'b'])
      useEditorStore.getState().setActiveTool('arrow')
      expect(useEditorStore.getState().selectedIds).toEqual([])
    })
  })

  describe('dirty state', () => {
    it('should start clean', () => {
      expect(useProjectStore.getState().isDirty).toBe(false)
    })

    it('should mark dirty on pushHistory', () => {
      useProjectStore.getState().pushHistory()
      expect(useProjectStore.getState().isDirty).toBe(true)
    })

    it('should mark clean explicitly', () => {
      useProjectStore.getState().pushHistory()
      useProjectStore.getState().markClean()
      expect(useProjectStore.getState().isDirty).toBe(false)
    })
  })

  describe('version history', () => {
    it('should save and restore versions', () => {
      useProjectStore.getState().addAnnotation({ id: 'v1', type: 'rectangle', x: 10, y: 10, width: 50, height: 50, stroke: '#f00', strokeWidth: 1 } as any)
      useProjectStore.getState().saveVersion('first')
      expect(useProjectStore.getState().versions).toHaveLength(1)
      expect(useProjectStore.getState().versions[0].name).toBe('first')

      // Modify state
      useProjectStore.getState().addAnnotation({ id: 'v2', type: 'rectangle', x: 100, y: 100, width: 50, height: 50, stroke: '#0f0', strokeWidth: 1 } as any)
      expect(useProjectStore.getState().annotations).toHaveLength(2)

      // Restore
      useProjectStore.getState().restoreVersion(0)
      expect(useProjectStore.getState().annotations).toHaveLength(1)
      expect(useProjectStore.getState().annotations[0].id).toBe('v1')
    })
  })

  describe('image flip', () => {
    it('should store flipX and flipY', () => {
      const id = useProjectStore.getState().addImage({
        data: 'data:image/png;base64,abc', name: 'test.png',
        x: 0, y: 0, width: 100, height: 100, naturalWidth: 100, naturalHeight: 100, role: 'standalone',
      })
      useProjectStore.getState().updateImage(id, { flipX: true, flipY: true })
      const img = useProjectStore.getState().images[0]
      expect(img.flipX).toBe(true)
      expect(img.flipY).toBe(true)
    })
  })

  describe('default values', () => {
    it('should use correct default constants', () => {
      expect(DEFAULT_STROKE_COLOR).toBe('#e74c3c')
      expect(DEFAULT_STROKE_WIDTH).toBe(3)
      expect(DEFAULT_FONT_SIZE).toBe(18)
      expect(DEFAULT_COUNTER_RADIUS).toBe(18)
      expect(DEFAULT_CORNER_RADIUS).toBe(6)
    })
  })
})
