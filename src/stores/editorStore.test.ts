import { describe, it, expect, beforeEach } from 'vitest'
import { useEditorStore } from './editorStore'

describe('editorStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useEditorStore.setState({
      activeTool: 'select',
      strokeColor: '#e74c3c',
      fillColor: '#ffffff',
      strokeWidth: 3,
      fontSize: 18,
      fontFamily: 'sans-serif',
      blurPixelSize: 10,
      opacity: 1,
      selectedIds: [],
      zoom: 1,
      stagePos: { x: 0, y: 0 },
      showGrid: false,
      isDrawing: false,
    })
  })

  it('should initialize with default values', () => {
    const state = useEditorStore.getState()
    expect(state.activeTool).toBe('select')
    expect(state.strokeColor).toBe('#e74c3c')
    expect(state.strokeWidth).toBe(3)
    expect(state.zoom).toBe(1)
    expect(state.selectedIds).toEqual([])
  })

  it('should set active tool and clear selection', () => {
    useEditorStore.getState().setSelectedIds(['abc'])
    useEditorStore.getState().setActiveTool('arrow')
    const state = useEditorStore.getState()
    expect(state.activeTool).toBe('arrow')
    expect(state.selectedIds).toEqual([])
  })

  it('should set stroke color', () => {
    useEditorStore.getState().setStrokeColor('#00ff00')
    expect(useEditorStore.getState().strokeColor).toBe('#00ff00')
  })

  it('should set fill color', () => {
    useEditorStore.getState().setFillColor('#0000ff')
    expect(useEditorStore.getState().fillColor).toBe('#0000ff')
  })

  it('should set stroke width', () => {
    useEditorStore.getState().setStrokeWidth(5)
    expect(useEditorStore.getState().strokeWidth).toBe(5)
  })

  it('should set font size', () => {
    useEditorStore.getState().setFontSize(24)
    expect(useEditorStore.getState().fontSize).toBe(24)
  })

  it('should set blur pixel size', () => {
    useEditorStore.getState().setBlurPixelSize(20)
    expect(useEditorStore.getState().blurPixelSize).toBe(20)
  })

  it('should set opacity', () => {
    useEditorStore.getState().setOpacity(0.5)
    expect(useEditorStore.getState().opacity).toBe(0.5)
  })

  it('should set selected ids', () => {
    useEditorStore.getState().setSelectedIds(['id1', 'id2'])
    expect(useEditorStore.getState().selectedIds).toEqual(['id1', 'id2'])
  })

  it('should set zoom', () => {
    useEditorStore.getState().setZoom(2)
    expect(useEditorStore.getState().zoom).toBe(2)
  })

  it('should set stage position', () => {
    useEditorStore.getState().setStagePos({ x: 100, y: 200 })
    expect(useEditorStore.getState().stagePos).toEqual({ x: 100, y: 200 })
  })

  it('should toggle grid', () => {
    expect(useEditorStore.getState().showGrid).toBe(false)
    useEditorStore.getState().toggleGrid()
    expect(useEditorStore.getState().showGrid).toBe(true)
    useEditorStore.getState().toggleGrid()
    expect(useEditorStore.getState().showGrid).toBe(false)
  })

  it('should set isDrawing', () => {
    useEditorStore.getState().setIsDrawing(true)
    expect(useEditorStore.getState().isDrawing).toBe(true)
  })

  it('should toggle snap to grid', () => {
    expect(useEditorStore.getState().snapToGrid).toBe(false)
    useEditorStore.getState().toggleSnap()
    expect(useEditorStore.getState().snapToGrid).toBe(true)
    useEditorStore.getState().toggleSnap()
    expect(useEditorStore.getState().snapToGrid).toBe(false)
  })

  it('should have default grid size', () => {
    expect(useEditorStore.getState().gridSize).toBe(20)
  })

  it('should manage clipboard', () => {
    expect(useEditorStore.getState().clipboard).toEqual([])
    const ann = { id: 'test', type: 'rectangle' as const, x: 0, y: 0, width: 10, height: 10, stroke: '#f00', strokeWidth: 1 }
    useEditorStore.getState().setClipboard([ann as any])
    expect(useEditorStore.getState().clipboard).toHaveLength(1)
  })

  it('should manage editing text id', () => {
    expect(useEditorStore.getState().editingTextId).toBeNull()
    useEditorStore.getState().setEditingTextId('txt-1')
    expect(useEditorStore.getState().editingTextId).toBe('txt-1')
    useEditorStore.getState().setEditingTextId(null)
    expect(useEditorStore.getState().editingTextId).toBeNull()
  })

  it('should manage cropping image id', () => {
    expect(useEditorStore.getState().croppingImageId).toBeNull()
    useEditorStore.getState().setCroppingImageId('img-1')
    expect(useEditorStore.getState().croppingImageId).toBe('img-1')
  })

  it('should clear cropping image id on tool switch', () => {
    useEditorStore.getState().setCroppingImageId('img-1')
    useEditorStore.getState().setActiveTool('arrow')
    expect(useEditorStore.getState().croppingImageId).toBeNull()
  })

  it('should manage pending connector ROI id', () => {
    expect(useEditorStore.getState().pendingConnectorRoiId).toBeNull()
    useEditorStore.getState().setPendingConnectorRoiId('roi-1')
    expect(useEditorStore.getState().pendingConnectorRoiId).toBe('roi-1')
  })

  it('should set canvas background color', () => {
    expect(useEditorStore.getState().canvasBgColor).toBe('transparent')
    useEditorStore.getState().setCanvasBgColor('#000000')
    expect(useEditorStore.getState().canvasBgColor).toBe('#000000')
    useEditorStore.getState().setCanvasBgColor('transparent')
    expect(useEditorStore.getState().canvasBgColor).toBe('transparent')
  })
})
