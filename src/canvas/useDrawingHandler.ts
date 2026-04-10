// Pointer-driven drawing logic for the canvas: turns press / drag /
// release events into new Annotation objects, one tool at a time.
// Per-tool branches are deliberately verbose -- each shape has its
// own quirks (counter wants a click, draw wants a polyline, line
// snaps to 15 deg increments while shift is held, ...) and the
// branches are easier to read separately than as a clever generic
// pipeline. EditorCanvas owns the Stage and forwards events here.

import { useCallback, useRef } from 'react'
import Konva from 'konva'
import { v4 as uuid } from 'uuid'
import { useEditorStore } from '../stores/editorStore'
import { useProjectStore } from '../stores/projectStore'
import {
  Annotation, ArrowAnnotation, TextAnnotation, TextBoxAnnotation, HighlightAnnotation,
  BlurAnnotation, RectangleAnnotation, EllipseAnnotation, LineAnnotation,
  DrawAnnotation, ColorBoxAnnotation, CounterAnnotation, DimensionAnnotation, StampAnnotation, STAMP_PRESETS,
  DEFAULT_COUNTER_RADIUS, DEFAULT_CORNER_RADIUS, DEFAULT_HIGHLIGHT_COLOR,
} from '../types'

function getStagePointerPos(stage: Konva.Stage, stagePos: { x: number; y: number }, zoom: number) {
  const pointer = stage.getPointerPosition()
  if (!pointer) return null
  return {
    x: (pointer.x - stagePos.x) / zoom,
    y: (pointer.y - stagePos.y) / zoom,
  }
}

export function useDrawingHandler(stageRef: React.RefObject<Konva.Stage | null>) {
  const drawingIdRef = useRef<string | null>(null)
  const startPosRef = useRef<{ x: number; y: number } | null>(null)

  const activeTool = useEditorStore((s) => s.activeTool)
  const strokeColor = useEditorStore((s) => s.strokeColor)
  const fillColor = useEditorStore((s) => s.fillColor)
  const strokeWidth = useEditorStore((s) => s.strokeWidth)
  const fontSize = useEditorStore((s) => s.fontSize)
  const fontFamily = useEditorStore((s) => s.fontFamily)
  const blurPixelSize = useEditorStore((s) => s.blurPixelSize)
  const opacity = useEditorStore((s) => s.opacity)
  const isDrawing = useEditorStore((s) => s.isDrawing)
  const setIsDrawing = useEditorStore((s) => s.setIsDrawing)
  const zoom = useEditorStore((s) => s.zoom)
  const stagePos = useEditorStore((s) => s.stagePos)
  const snapEnabled = useEditorStore((s) => s.snapToGrid)
  const gridSize = useEditorStore((s) => s.gridSize)

  const snap = (v: number) => snapEnabled ? Math.round(v / gridSize) * gridSize : v

  const addAnnotation = useProjectStore((s) => s.addAnnotation)
  const updateAnnotation = useProjectStore((s) => s.updateAnnotation)
  const pushHistory = useProjectStore((s) => s.pushHistory)
  const getNextCounter = useProjectStore((s) => s.getNextCounter)

  const onMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (activeTool === 'select') return
      // Allow drawing on canvas background and on images, but not on annotations
      const target = e.target
      const isStage = target === target.getStage()
      const isBg = target.attrs.id === 'canvas-bg'
      const isImage = target.getClassName?.() === 'Image'
      if (!isStage && !isBg && !isImage) return

      const stage = stageRef.current
      if (!stage) return
      const rawPos = getStagePointerPos(stage, stagePos, zoom)
      if (!rawPos) return
      const pos = { x: snap(rawPos.x), y: snap(rawPos.y) }

      const id = uuid()
      drawingIdRef.current = id
      startPosRef.current = pos
      setIsDrawing(true)
      pushHistory()

      let annotation: Annotation | null = null

      switch (activeTool) {
        case 'arrow':
          annotation = {
            id, type: 'arrow', x: 0, y: 0,
            points: [pos.x, pos.y, pos.x, pos.y],
            stroke: strokeColor, strokeWidth, headSize: strokeWidth * 3, opacity,
          } as ArrowAnnotation
          break

        case 'text': {
          annotation = {
            id, type: 'text', x: pos.x, y: pos.y,
            text: '', fontSize, fontFamily, fill: strokeColor,
            backgroundColor: 'rgba(255,255,255,0.85)', padding: 6, opacity,
          } as TextAnnotation
          setIsDrawing(false)
          drawingIdRef.current = null
          // Trigger inline editing
          setTimeout(() => {
            useEditorStore.getState().setEditingTextId(id)
            useEditorStore.getState().setSelectedIds([id])
          }, 50)
          break
        }

        case 'textbox':
          annotation = {
            id, type: 'textbox', x: pos.x, y: pos.y,
            width: 0, height: 0, text: '', fontSize, fontFamily,
            fill: strokeColor, backgroundColor: fillColor,
            borderColor: strokeColor, borderWidth: 2, borderRadius: DEFAULT_CORNER_RADIUS,
            padding: 10, textAlign: 'left', opacity,
          } as TextBoxAnnotation
          break

        case 'highlight':
          annotation = {
            id, type: 'highlight', x: pos.x, y: pos.y,
            width: 0, height: 0, fill: (!fillColor || fillColor === 'transparent') ? DEFAULT_HIGHLIGHT_COLOR : fillColor,
            opacity: opacity !== 1 ? opacity : 0.35,
          } as HighlightAnnotation
          break

        case 'blur':
          annotation = {
            id, type: 'blur', x: pos.x, y: pos.y,
            width: 0, height: 0, pixelSize: blurPixelSize, opacity,
          } as BlurAnnotation
          break

        case 'rectangle':
          annotation = {
            id, type: 'rectangle', x: pos.x, y: pos.y,
            width: 0, height: 0, stroke: strokeColor, strokeWidth, cornerRadius: DEFAULT_CORNER_RADIUS,
            fill: fillColor === 'transparent' ? undefined : fillColor, opacity,
          } as RectangleAnnotation
          break

        case 'ellipse':
          annotation = {
            id, type: 'ellipse', x: pos.x, y: pos.y,
            radiusX: 0, radiusY: 0, stroke: strokeColor, strokeWidth,
            fill: fillColor === 'transparent' ? undefined : fillColor, opacity,
          } as EllipseAnnotation
          break

        case 'line':
          annotation = {
            id, type: 'line', x: 0, y: 0,
            points: [pos.x, pos.y, pos.x, pos.y],
            stroke: strokeColor, strokeWidth, opacity,
          } as LineAnnotation
          break

        case 'draw':
          annotation = {
            id, type: 'draw', x: 0, y: 0,
            points: [pos.x, pos.y],
            stroke: strokeColor, strokeWidth, opacity,
          } as DrawAnnotation
          break

        case 'colorbox':
          annotation = {
            id, type: 'colorbox', x: pos.x, y: pos.y,
            width: 0, height: 0, fill: (!fillColor || fillColor === 'transparent') ? strokeColor : fillColor, opacity,
          } as ColorBoxAnnotation
          break

        case 'counter': {
          const num = getNextCounter()
          annotation = {
            id, type: 'counter', x: pos.x, y: pos.y,
            number: num, fill: strokeColor, textColor: '#ffffff',
            radius: fontSize, fontSize, opacity,
          } as CounterAnnotation
          break
        }

        case 'stamp': {
          annotation = {
            id, type: 'stamp', x: pos.x, y: pos.y,
            text: STAMP_PRESETS[0], fontSize: 24,
            fill: '#e74c3c', borderColor: '#e74c3c', opacity,
          } as StampAnnotation
          setIsDrawing(false)
          drawingIdRef.current = null
          break
        }

        case 'dimension': {
          // Check for calibration from previous dimension lines
          const dims = useProjectStore.getState().annotations.filter((a) => a.type === 'dimension') as DimensionAnnotation[]
          const lastCalibrated = dims.filter((d) => d.pixelsPerUnit !== 1).pop()
          const ppu = lastCalibrated?.pixelsPerUnit ?? 1
          const unit = lastCalibrated?.unit ?? 'px'
          annotation = {
            id, type: 'dimension', x: 0, y: 0,
            points: [pos.x, pos.y, pos.x, pos.y],
            stroke: strokeColor, strokeWidth: 1.5, fontSize,
            label: '', unit, pixelsPerUnit: ppu, capSize: 8, opacity,
          } as DimensionAnnotation
          break
        }

      }

      if (annotation) {
        addAnnotation(annotation)
      }
    },
    [activeTool, strokeColor, fillColor, strokeWidth, fontSize, fontFamily, blurPixelSize, opacity, zoom, stagePos, stageRef, addAnnotation, pushHistory, setIsDrawing, getNextCounter],
  )

  const onMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!drawingIdRef.current || !startPosRef.current) return

      const stage = stageRef.current
      if (!stage) return
      const rawPos = getStagePointerPos(stage, stagePos, zoom)
      if (!rawPos) return
      // Don't snap freehand drawing
      const pos = activeTool === 'draw' ? rawPos : { x: snap(rawPos.x), y: snap(rawPos.y) }

      const start = startPosRef.current
      const id = drawingIdRef.current

      switch (activeTool) {
        case 'arrow':
          updateAnnotation(id, { points: [start.x, start.y, pos.x, pos.y] })
          break
        case 'line':
          updateAnnotation(id, { points: [start.x, start.y, pos.x, pos.y] })
          break
        case 'draw':
          // Append point to the draw annotation
          const annotations = useProjectStore.getState().annotations
          const drawAnn = annotations.find((a) => a.id === id)
          if (drawAnn && drawAnn.type === 'draw') {
            updateAnnotation(id, { points: [...drawAnn.points, pos.x, pos.y] })
          }
          break
        case 'highlight':
        case 'blur':
        case 'rectangle':
        case 'colorbox':
        case 'textbox': {
          const x = Math.min(start.x, pos.x)
          const y = Math.min(start.y, pos.y)
          const width = Math.abs(pos.x - start.x)
          const height = Math.abs(pos.y - start.y)
          updateAnnotation(id, { x, y, width, height })
          break
        }
        case 'ellipse': {
          const rx = Math.abs(pos.x - start.x) / 2
          const ry = Math.abs(pos.y - start.y) / 2
          const cx = Math.min(start.x, pos.x)
          const cy = Math.min(start.y, pos.y)
          updateAnnotation(id, { x: cx, y: cy, radiusX: rx, radiusY: ry })
          break
        }
        case 'counter':
          updateAnnotation(id, { tailX: pos.x - start.x, tailY: pos.y - start.y })
          break
        case 'dimension':
          updateAnnotation(id, { points: [start.x, start.y, pos.x, pos.y] })
          break
      }
    },
    [activeTool, zoom, stagePos, stageRef, updateAnnotation],
  )

  const onMouseUp = useCallback(() => {
    if (!drawingIdRef.current) return
    const id = drawingIdRef.current

    // After drawing a dimension line, set default label based on pixel length and calibration
    if (activeTool === 'dimension' && id !== 'crop') {
      const ann = useProjectStore.getState().annotations.find((a) => a.id === id) as DimensionAnnotation | undefined
      if (ann) {
        const [x1, y1, x2, y2] = ann.points
        const pxLen = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
        if (ann.pixelsPerUnit !== 1 && ann.unit !== 'px') {
          // Calibrated: show real-world value with unit
          const val = pxLen / ann.pixelsPerUnit
          updateAnnotation(id, { label: val.toFixed(1) + ' ' + ann.unit } as any)
        } else {
          // Not calibrated: show pixels
          updateAnnotation(id, { label: Math.round(pxLen) + ' px' } as any)
        }
      }
    }

    // After drawing a counter, clear tail if too short (click without meaningful drag)
    if (activeTool === 'counter') {
      const ann = useProjectStore.getState().annotations.find((a) => a.id === id) as CounterAnnotation | undefined
      if (ann && ann.tailX !== undefined && ann.tailY !== undefined) {
        const dist = Math.sqrt(ann.tailX ** 2 + ann.tailY ** 2)
        if (dist < 5) {
          updateAnnotation(id, { tailX: undefined, tailY: undefined } as any)
        }
      }
    }

    // After drawing a textbox, ensure minimum size and trigger inline text editing
    if (activeTool === 'textbox' && id !== 'crop') {
      const ann = useProjectStore.getState().annotations.find((a) => a.id === id)
      if (ann && 'width' in ann) {
        const a = ann as any
        if (a.width < 80 || a.height < 40) {
          updateAnnotation(id, { width: Math.max(200, a.width), height: Math.max(60, a.height) } as any)
        }
      }
      setTimeout(() => {
        useEditorStore.getState().setEditingTextId(id)
        useEditorStore.getState().setSelectedIds([id])
      }, 50)
    }

    setIsDrawing(false)
    drawingIdRef.current = null
    startPosRef.current = null
  }, [activeTool, setIsDrawing])

  return { onMouseDown, onMouseMove, onMouseUp }
}
