import { describe, it, expect, beforeEach } from 'vitest'
import { useProjectStore } from './projectStore'
import { ArrowAnnotation, TextAnnotation, CounterAnnotation, RectangleAnnotation, Project } from '../types'

describe('projectStore', () => {
  beforeEach(() => {
    useProjectStore.getState().clearProject()
  })

  describe('project metadata', () => {
    it('should initialize with defaults', () => {
      const s = useProjectStore.getState()
      expect(s.projectName).toBe('Untitled')
      expect(s.canvasWidth).toBe(1920)
      expect(s.canvasHeight).toBe(1080)
      expect(s.images).toEqual([])
      expect(s.annotations).toEqual([])
    })

    it('should set project metadata', () => {
      useProjectStore.getState().setProjectMeta('Test Project', 800, 600)
      const s = useProjectStore.getState()
      expect(s.projectName).toBe('Test Project')
      expect(s.canvasWidth).toBe(800)
      expect(s.canvasHeight).toBe(600)
    })
  })

  describe('images', () => {
    it('should add an image and return its id', () => {
      const id = useProjectStore.getState().addImage({
        data: 'data:image/png;base64,abc',
        name: 'test.png',
        x: 100, y: 200, width: 400, height: 300,
        naturalWidth: 800, naturalHeight: 600,
        role: 'standalone',
      })
      expect(id).toBeTruthy()
      const images = useProjectStore.getState().images
      expect(images).toHaveLength(1)
      expect(images[0].name).toBe('test.png')
      expect(images[0].x).toBe(100)
    })

    it('should update an image', () => {
      const id = useProjectStore.getState().addImage({
        data: 'data:image/png;base64,abc',
        name: 'test.png',
        x: 0, y: 0, width: 100, height: 100,
        naturalWidth: 100, naturalHeight: 100,
        role: 'standalone',
      })
      useProjectStore.getState().updateImage(id, { x: 50, y: 50 })
      const img = useProjectStore.getState().images[0]
      expect(img.x).toBe(50)
      expect(img.y).toBe(50)
    })

    it('should remove an image and its connectors', () => {
      const id = useProjectStore.getState().addImage({
        data: 'data:image/png;base64,abc',
        name: 'test.png',
        x: 0, y: 0, width: 100, height: 100,
        naturalWidth: 100, naturalHeight: 100,
        role: 'detail',
      })
      // Add a connector pointing to this image
      useProjectStore.getState().addConnector({
        fromRoiId: 'roi-1',
        toImageId: id,
        color: '#ff0000',
        style: 'orthogonal',
      })
      expect(useProjectStore.getState().connectors).toHaveLength(1)

      useProjectStore.getState().removeImage(id)
      expect(useProjectStore.getState().images).toHaveLength(0)
      expect(useProjectStore.getState().connectors).toHaveLength(0)
    })
  })

  describe('annotations', () => {
    it('should add an annotation', () => {
      const ann: ArrowAnnotation = {
        id: 'arrow-1', type: 'arrow', x: 0, y: 0,
        points: [10, 10, 100, 100],
        stroke: '#ff0000', strokeWidth: 3, headSize: 9,
      }
      useProjectStore.getState().addAnnotation(ann)
      expect(useProjectStore.getState().annotations).toHaveLength(1)
      expect(useProjectStore.getState().annotations[0].id).toBe('arrow-1')
    })

    it('should update an annotation', () => {
      const ann: RectangleAnnotation = {
        id: 'rect-1', type: 'rectangle', x: 10, y: 10,
        width: 100, height: 50, stroke: '#ff0000', strokeWidth: 2,
      }
      useProjectStore.getState().addAnnotation(ann)
      useProjectStore.getState().updateAnnotation('rect-1', { x: 50, width: 200 })
      const updated = useProjectStore.getState().annotations[0]
      expect(updated.x).toBe(50)
      expect((updated as RectangleAnnotation).width).toBe(200)
    })

    it('should remove an annotation', () => {
      const ann: ArrowAnnotation = {
        id: 'arrow-1', type: 'arrow', x: 0, y: 0,
        points: [10, 10, 100, 100],
        stroke: '#ff0000', strokeWidth: 3, headSize: 9,
      }
      useProjectStore.getState().addAnnotation(ann)
      useProjectStore.getState().removeAnnotation('arrow-1')
      expect(useProjectStore.getState().annotations).toHaveLength(0)
    })
  })

  describe('counters', () => {
    it('should auto-increment counters', () => {
      const s = useProjectStore.getState()
      expect(s.getNextCounter()).toBe(1)
      expect(s.getNextCounter()).toBe(2)
      expect(s.getNextCounter()).toBe(3)
    })

    it('should renumber counters by position', () => {
      const counters: CounterAnnotation[] = [
        { id: 'c1', type: 'counter', x: 200, y: 100, number: 1, fill: '#f00', textColor: '#fff', radius: 16, fontSize: 16 },
        { id: 'c2', type: 'counter', x: 100, y: 50, number: 2, fill: '#f00', textColor: '#fff', radius: 16, fontSize: 16 },
        { id: 'c3', type: 'counter', x: 300, y: 50, number: 3, fill: '#f00', textColor: '#fff', radius: 16, fontSize: 16 },
      ]
      counters.forEach((c) => useProjectStore.getState().addAnnotation(c))
      useProjectStore.getState().renumberCounters()
      const anns = useProjectStore.getState().annotations as CounterAnnotation[]
      // c2 (y=50, x=100) -> 1, c3 (y=50, x=300) -> 2, c1 (y=100, x=200) -> 3
      expect(anns.find((a) => a.id === 'c2')!.number).toBe(1)
      expect(anns.find((a) => a.id === 'c3')!.number).toBe(2)
      expect(anns.find((a) => a.id === 'c1')!.number).toBe(3)
    })
  })

  describe('ROIs', () => {
    it('should add ROI with auto-number and color', () => {
      const roi = useProjectStore.getState().addROI({
        imageId: 'img-1', x: 10, y: 10, width: 50, height: 50,
      })
      expect(roi.number).toBe(1)
      expect(roi.color).toBe('#e74c3c') // first ROI color

      const roi2 = useProjectStore.getState().addROI({
        imageId: 'img-1', x: 200, y: 200, width: 50, height: 50,
      })
      expect(roi2.number).toBe(2)
      expect(roi2.color).toBe('#3498db') // second ROI color
    })

    it('should remove ROI and its connectors', () => {
      const roi = useProjectStore.getState().addROI({
        imageId: 'img-1', x: 10, y: 10, width: 50, height: 50,
      })
      useProjectStore.getState().addConnector({
        fromRoiId: roi.id, toImageId: 'img-2', color: roi.color, style: 'orthogonal',
      })
      expect(useProjectStore.getState().connectors).toHaveLength(1)

      useProjectStore.getState().removeROI(roi.id)
      expect(useProjectStore.getState().rois).toHaveLength(0)
      expect(useProjectStore.getState().connectors).toHaveLength(0)
    })
  })

  describe('connectors', () => {
    it('should add and remove connectors', () => {
      useProjectStore.getState().addConnector({
        fromRoiId: 'roi-1', toImageId: 'img-2', color: '#ff0000', style: 'straight',
      })
      expect(useProjectStore.getState().connectors).toHaveLength(1)

      const id = useProjectStore.getState().connectors[0].id
      useProjectStore.getState().removeConnector(id)
      expect(useProjectStore.getState().connectors).toHaveLength(0)
    })
  })

  describe('undo/redo', () => {
    it('should undo and redo annotation changes', () => {
      const s = useProjectStore.getState()
      s.pushHistory() // save initial state (empty)

      // Add an annotation
      const ann: ArrowAnnotation = {
        id: 'arrow-1', type: 'arrow', x: 0, y: 0,
        points: [0, 0, 100, 100],
        stroke: '#ff0000', strokeWidth: 3, headSize: 9,
      }
      s.addAnnotation(ann)
      s.pushHistory()

      expect(useProjectStore.getState().annotations).toHaveLength(1)

      // Undo
      useProjectStore.getState().undo()
      expect(useProjectStore.getState().annotations).toHaveLength(0)

      // Redo
      useProjectStore.getState().redo()
      expect(useProjectStore.getState().annotations).toHaveLength(1)
    })

    it('should not undo past the beginning', () => {
      useProjectStore.getState().pushHistory()
      useProjectStore.getState().undo()
      useProjectStore.getState().undo()
      useProjectStore.getState().undo()
      // Should not throw, just stay at initial state
      expect(useProjectStore.getState().annotations).toEqual([])
    })

    it('should truncate redo history when new action is taken after undo', () => {
      const s = useProjectStore.getState()
      s.pushHistory()

      s.addAnnotation({
        id: 'a1', type: 'arrow', x: 0, y: 0,
        points: [0, 0, 100, 100],
        stroke: '#ff0000', strokeWidth: 3, headSize: 9,
      } as ArrowAnnotation)
      s.pushHistory()

      s.addAnnotation({
        id: 'a2', type: 'arrow', x: 0, y: 0,
        points: [0, 0, 200, 200],
        stroke: '#00ff00', strokeWidth: 3, headSize: 9,
      } as ArrowAnnotation)
      s.pushHistory()

      // Undo twice
      useProjectStore.getState().undo()
      useProjectStore.getState().undo()
      expect(useProjectStore.getState().annotations).toHaveLength(0)

      // New action -- should truncate the redo history
      useProjectStore.getState().addAnnotation({
        id: 'a3', type: 'rectangle', x: 0, y: 0,
        width: 50, height: 50, stroke: '#0000ff', strokeWidth: 2,
      } as RectangleAnnotation)
      useProjectStore.getState().pushHistory()

      // Redo should not bring back the old arrows
      useProjectStore.getState().redo()
      const anns = useProjectStore.getState().annotations
      expect(anns).toHaveLength(1)
      expect(anns[0].id).toBe('a3')
    })
  })

  describe('serialization', () => {
    it('should serialize to Project and deserialize back', () => {
      const s = useProjectStore.getState()
      s.setProjectMeta('Test', 1024, 768)
      s.addImage({
        data: 'data:image/png;base64,abc',
        name: 'test.png',
        x: 0, y: 0, width: 100, height: 100,
        naturalWidth: 100, naturalHeight: 100,
        role: 'overview',
      })
      s.addAnnotation({
        id: 'txt-1', type: 'text', x: 50, y: 50,
        text: 'Hello', fontSize: 18, fontFamily: 'sans-serif', fill: '#000',
      } as TextAnnotation)

      const project = useProjectStore.getState().toProject()
      expect(project.version).toBe(1)
      expect(project.name).toBe('Test')
      expect(project.images).toHaveLength(1)
      expect(project.annotations).toHaveLength(1)

      // Clear and reload
      s.clearProject()
      expect(useProjectStore.getState().images).toHaveLength(0)

      useProjectStore.getState().loadProject(project, 'test-id')
      const loaded = useProjectStore.getState()
      expect(loaded.projectName).toBe('Test')
      expect(loaded.projectId).toBe('test-id')
      expect(loaded.images).toHaveLength(1)
      expect(loaded.annotations).toHaveLength(1)
    })

    it('should count existing counters when loading project', () => {
      const project: Project = {
        version: 1, name: 'Test', canvasWidth: 800, canvasHeight: 600,
        images: [], rois: [], connectors: [],
        annotations: [
          { id: 'c1', type: 'counter', x: 0, y: 0, number: 1, fill: '#f00', textColor: '#fff', radius: 16, fontSize: 16 } as CounterAnnotation,
          { id: 'c2', type: 'counter', x: 50, y: 0, number: 2, fill: '#f00', textColor: '#fff', radius: 16, fontSize: 16 } as CounterAnnotation,
        ],
      }
      useProjectStore.getState().loadProject(project)
      expect(useProjectStore.getState().nextCounter).toBe(3)
    })
  })
})
