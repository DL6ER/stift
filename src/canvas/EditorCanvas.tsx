// Top-level canvas surface: owns the Konva Stage, handles zoom/pan,
// pinch-to-zoom on touch, space+drag panning, rubber-band selection,
// image drops, and wiring the Transformer up to whatever is selected.
// Drawing of individual annotations is delegated to AnnotationRenderer;
// ROIs and connectors live in ConnectorRenderer. This file should stay
// focused on viewport mechanics, not on the shapes themselves.

import { useRef, useCallback, useEffect, useState } from 'react'
import { Stage, Layer, Rect, Image as KonvaImage, Transformer } from 'react-konva'
import Konva from 'konva'
import { useEditorStore } from '../stores/editorStore'
import { useProjectStore } from '../stores/projectStore'
import { AnnotationRenderer } from './AnnotationRenderer'
import { useDrawingHandler } from './useDrawingHandler'
import { useImageDrop } from './useImageDrop'
import { InlineTextEditor } from './InlineTextEditor'
import { ConnectorRenderer } from './objects/ConnectorRenderer'

export function EditorCanvas() {
  const stageRef = useRef<Konva.Stage>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 })
  const [isPanning, setIsPanning] = useState(false)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [shiftHeld, setShiftHeld] = useState(false)
  // Eyedropper loupe state
  const [eyedropperActive, setEyedropperActive] = useState(false)
  const [eyedropperColor, setEyedropperColor] = useState('#000000')
  const loupeRef = useRef<HTMLCanvasElement>(null)
  const panStart = useRef<{ x: number; y: number } | null>(null)
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const selBoxStart = useRef<{ x: number; y: number } | null>(null)

  const zoom = useEditorStore((s) => s.zoom)
  const setZoom = useEditorStore((s) => s.setZoom)
  const stagePos = useEditorStore((s) => s.stagePos)
  const setStagePos = useEditorStore((s) => s.setStagePos)
  const activeTool = useEditorStore((s) => s.activeTool)
  const selectedIds = useEditorStore((s) => s.selectedIds)
  const setSelectedIds = useEditorStore((s) => s.setSelectedIds)
  const showGrid = useEditorStore((s) => s.showGrid)
  const canvasBgColor = useEditorStore((s) => s.canvasBgColor)

  const canvasWidth = useProjectStore((s) => s.canvasWidth)
  const canvasHeight = useProjectStore((s) => s.canvasHeight)
  const images = useProjectStore((s) => s.images)
  const updateImage = useProjectStore((s) => s.updateImage)
  const pushHistory = useProjectStore((s) => s.pushHistory)

  const { onMouseDown, onMouseMove, onMouseUp, onWheelDuringDraw } = useDrawingHandler(stageRef)
  useImageDrop(containerRef)

  // Touch: pinch-to-zoom and two-finger pan
  const lastTouchDist = useRef<number>(0)
  const lastTouchCenter = useRef<{ x: number; y: number } | null>(null)

  const handleTouchMove = useCallback((e: Konva.KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches
    if (touches.length === 2) {
      e.evt.preventDefault()
      const t1 = touches[0], t2 = touches[1]
      const dist = Math.sqrt((t2.clientX - t1.clientX) ** 2 + (t2.clientY - t1.clientY) ** 2)
      const center = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 }

      if (lastTouchDist.current > 0 && lastTouchCenter.current) {
        // Pinch zoom
        const scale = dist / lastTouchDist.current
        const newZoom = Math.max(0.1, Math.min(10, zoom * scale))
        setZoom(newZoom)
        // Pan
        const dx = center.x - lastTouchCenter.current.x
        const dy = center.y - lastTouchCenter.current.y
        setStagePos({ x: stagePos.x + dx, y: stagePos.y + dy })
      }
      lastTouchDist.current = dist
      lastTouchCenter.current = center
    }
  }, [zoom, stagePos, setZoom, setStagePos])

  const handleTouchEnd = useCallback(() => {
    lastTouchDist.current = 0
    lastTouchCenter.current = null
  }, [])

  // Space key for panning
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        setSpaceHeld(true)
      }
      if (e.key === 'Shift') setShiftHeld(true)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceHeld(false)
      if (e.key === 'Shift') setShiftHeld(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp) }
  }, [])

  const handlePanMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!spaceHeld && e.evt.button !== 1) return // Space+click or middle mouse
    e.evt.preventDefault()
    setIsPanning(true)
    panStart.current = { x: e.evt.clientX - stagePos.x, y: e.evt.clientY - stagePos.y }
  }, [spaceHeld, stagePos])

  const handlePanMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isPanning || !panStart.current) return
    setStagePos({ x: e.evt.clientX - panStart.current.x, y: e.evt.clientY - panStart.current.y })
  }, [isPanning, setStagePos])

  const handlePanMouseUp = useCallback(() => {
    setIsPanning(false)
    panStart.current = null
  }, [])

  // Selection box (drag-to-select in select mode)
  const handleSelBoxStart = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (activeTool !== 'select' || spaceHeld || e.evt.button !== 0) return
    // Only start selection box on empty canvas
    if (e.target !== e.target.getStage() && e.target.attrs.id !== 'canvas-bg') return
    const stage = stageRef.current
    if (!stage) return
    const pointer = stage.getPointerPosition()
    if (!pointer) return
    const x = (pointer.x - stagePos.x) / zoom
    const y = (pointer.y - stagePos.y) / zoom
    selBoxStart.current = { x, y }
  }, [activeTool, spaceHeld, zoom, stagePos])

  const handleSelBoxMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!selBoxStart.current || activeTool !== 'select') return
    const stage = stageRef.current
    if (!stage) return
    const pointer = stage.getPointerPosition()
    if (!pointer) return
    const cx = (pointer.x - stagePos.x) / zoom
    const cy = (pointer.y - stagePos.y) / zoom
    const sx = selBoxStart.current.x
    const sy = selBoxStart.current.y
    setSelectionBox({
      x: Math.min(sx, cx), y: Math.min(sy, cy),
      w: Math.abs(cx - sx), h: Math.abs(cy - sy),
    })
  }, [activeTool, zoom, stagePos])

  const handleSelBoxEnd = useCallback(() => {
    if (!selBoxStart.current || !selectionBox) {
      selBoxStart.current = null
      setSelectionBox(null)
      return
    }
    const box = selectionBox
    if (box.w < 5 && box.h < 5) {
      // Too small -- just a click, not a drag
      selBoxStart.current = null
      setSelectionBox(null)
      return
    }

    // Find all annotations/images within the selection box
    const store = useProjectStore.getState()
    const ids: string[] = []

    for (const ann of store.annotations) {
      let ax = ann.x, ay = ann.y, aw = 0, ah = 0
      if ('width' in ann && 'height' in ann) {
        aw = (ann as any).width; ah = (ann as any).height
      } else if ('radiusX' in ann) {
        aw = (ann as any).radiusX * 2; ah = (ann as any).radiusY * 2
      }
      // Check if annotation center is within selection box
      const cx = ax + aw / 2, cy = ay + ah / 2
      if (cx >= box.x && cx <= box.x + box.w && cy >= box.y && cy <= box.y + box.h) {
        ids.push(ann.id)
      }
    }
    for (const img of store.images) {
      const cx = img.x + img.width / 2, cy = img.y + img.height / 2
      if (cx >= box.x && cx <= box.x + box.w && cy >= box.y && cy <= box.y + box.h) {
        ids.push(img.id)
      }
    }

    if (ids.length > 0) setSelectedIds(ids)
    selBoxStart.current = null
    setSelectionBox(null)
  }, [selectionBox, setSelectedIds])

  // Expose stage ref globally for export
  useEffect(() => {
    (window as any).__stift_stage = stageRef.current
  })

  // Resize observer
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setContainerSize({ width, height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Update transformer selection
  useEffect(() => {
    const tr = transformerRef.current
    const stage = stageRef.current
    if (!tr || !stage) return

    const nodes = selectedIds
      .map((id) => stage.findOne(`#${id}`))
      .filter(Boolean) as Konva.Node[]
    tr.nodes(nodes)
    tr.getLayer()?.batchDraw()
  }, [selectedIds])

  // Eyedropper: 5x magnified loupe following the real cursor position.
  const LOUPE_SIZE = 120
  const LOUPE_MAG = 5

  const updateLoupe = useCallback((screenX: number, screenY: number) => {
    const stage = stageRef.current
    const loupe = loupeRef.current
    if (!stage || !loupe) return
    const ctx = loupe.getContext('2d')
    if (!ctx) return
    const pointer = stage.getPointerPosition()
    if (!pointer) return
    const stageCanvas = stage.toCanvas()
    const ratio = stageCanvas.width / stage.width()
    // Composite onto a white background so transparent areas render
    // opaque in the loupe and the sampled color is what the user sees.
    const flat = document.createElement('canvas')
    flat.width = stageCanvas.width
    flat.height = stageCanvas.height
    const fCtx = flat.getContext('2d')!
    fCtx.fillStyle = '#ffffff'
    fCtx.fillRect(0, 0, flat.width, flat.height)
    fCtx.drawImage(stageCanvas, 0, 0)
    const px = pointer.x * ratio
    const py = pointer.y * ratio
    const srcSize = (LOUPE_SIZE / LOUPE_MAG) * ratio
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, LOUPE_SIZE, LOUPE_SIZE)
    ctx.drawImage(flat, px - srcSize / 2, py - srcSize / 2, srcSize, srcSize, 0, 0, LOUPE_SIZE, LOUPE_SIZE)
    const mid = LOUPE_SIZE / 2
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'
    ctx.lineWidth = 1
    ctx.strokeRect(mid - LOUPE_MAG / 2, mid - LOUPE_MAG / 2, LOUPE_MAG, LOUPE_MAG)
    const pixel = fCtx.getImageData(Math.round(px), Math.round(py), 1, 1).data
    const hex = '#' + [pixel[0], pixel[1], pixel[2]].map(c => c.toString(16).padStart(2, '0')).join('')
    setEyedropperColor(hex)
    loupe.style.left = (screenX - LOUPE_SIZE / 2) + 'px'
    loupe.style.top = (screenY - LOUPE_SIZE - 20) + 'px'
    const label = document.getElementById('eyedropper-label')
    if (label) {
      label.style.left = (screenX - 30) + 'px'
      label.style.top = (screenY - LOUPE_SIZE - 40) + 'px'
    }
  }, [stageRef])

  const handleEyedropperDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (activeTool !== 'eyedropper') return
    setEyedropperActive(true)
    updateLoupe(e.evt.clientX, e.evt.clientY)
  }, [activeTool, updateLoupe])

  const handleEyedropperMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!eyedropperActive || activeTool !== 'eyedropper') return
    updateLoupe(e.evt.clientX, e.evt.clientY)
  }, [eyedropperActive, activeTool, updateLoupe])

  const handleEyedropperUp = useCallback(() => {
    if (!eyedropperActive) return
    setEyedropperActive(false)
    const color = eyedropperColor
    const store = useEditorStore.getState()
    const pStore = useProjectStore.getState()
    const sel = store.selectedIds

    // If annotations are selected, apply the picked color to them
    if (sel.length > 0) {
      pStore.pushHistory()
      for (const id of sel) {
        const ann = pStore.annotations.find(a => a.id === id)
        if (!ann) continue
        const patch: Record<string, any> = {}
        if ('stroke' in ann) patch.stroke = color
        if ('fill' in ann) patch.fill = color
        if (ann.type === 'textbox') { patch.borderColor = color; delete patch.fill }
        if (ann.type === 'text') { /* fill is text color, correct */ }
        pStore.updateAnnotation(id, patch)
      }
    }

    // Always update defaults too
    store.setStrokeColor(color)
    store.setFillColor(color)
    store.setActiveTool('select')
  }, [eyedropperActive, eyedropperColor])

  // Zoom with mouse wheel
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault()

      if (onWheelDuringDraw(e.evt.deltaY)) return

      const stage = stageRef.current
      if (!stage) return

      const oldScale = zoom
      const pointer = stage.getPointerPosition()!
      const mousePointTo = {
        x: (pointer.x - stagePos.x) / oldScale,
        y: (pointer.y - stagePos.y) / oldScale,
      }

      const direction = e.evt.deltaY > 0 ? -1 : 1
      const factor = 1.08
      const newScale = direction > 0 ? oldScale * factor : oldScale / factor
      const clampedScale = Math.max(0.1, Math.min(10, newScale))

      setZoom(clampedScale)
      setStagePos({
        x: pointer.x - mousePointTo.x * clampedScale,
        y: pointer.y - mousePointTo.y * clampedScale,
      })
    },
    [zoom, stagePos, setZoom, setStagePos, onWheelDuringDraw],
  )

  // Click handler
  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // Eyedropper handled via mousedown/move/up below, not click
      if (activeTool === 'eyedropper') return

      // Connector tool: two-click interaction
      if (activeTool === 'connector') {
        const stage = stageRef.current
        if (!stage) return
        const pointer = stage.getPointerPosition()
        if (!pointer) return
        const canvasX = (pointer.x - stagePos.x) / zoom
        const canvasY = (pointer.y - stagePos.y) / zoom

        // Find which image was clicked
        const clickedImage = images.find((img) =>
          canvasX >= img.x && canvasX <= img.x + img.width &&
          canvasY >= img.y && canvasY <= img.y + img.height
        )
        if (!clickedImage) return

        const pendingRoiId = useEditorStore.getState().pendingConnectorRoiId
        if (!pendingRoiId) {
          // First click: create ROI on this image
          const relX = canvasX - clickedImage.x - 25
          const relY = canvasY - clickedImage.y - 25
          const roi = useProjectStore.getState().addROI({
            imageId: clickedImage.id,
            x: Math.max(0, relX),
            y: Math.max(0, relY),
            width: 50,
            height: 50,
          })
          useEditorStore.getState().setPendingConnectorRoiId(roi.id)
        } else {
          // Second click: create connector to this image
          const roi = useProjectStore.getState().rois.find((r) => r.id === pendingRoiId)
          if (roi && roi.imageId !== clickedImage.id) {
            useProjectStore.getState().pushHistory()
            useProjectStore.getState().addConnector({
              fromRoiId: pendingRoiId,
              toImageId: clickedImage.id,
              color: roi.color,
              strokeWidth: 2,
              style: 'straight',
            })
          }
          useEditorStore.getState().setPendingConnectorRoiId(null)
        }
        return
      }

      // Empty area click to deselect and exit crop mode
      if (e.target === e.target.getStage() || e.target.attrs.id === 'canvas-bg') {
        if (activeTool === 'select') {
          setSelectedIds([])
        }
        useEditorStore.getState().setCroppingImageId(null)
      }
    },
    [activeTool, setSelectedIds, images, zoom, stagePos, stageRef],
  )

  const handleDblClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const id = e.target.attrs.id || e.target.parent?.attrs.id
      if (!id) return
      // Text editing
      const ann = useProjectStore.getState().annotations.find((a) => a.id === id)
      if (ann && (ann.type === 'text' || ann.type === 'textbox')) {
        useEditorStore.getState().setEditingTextId(id)
        return
      }
      // Image crop mode
      const img = useProjectStore.getState().images.find((i) => i.id === id)
      if (img) {
        useEditorStore.getState().setCroppingImageId(id)
        useEditorStore.getState().setSelectedIds([id])
      }
    },
    [],
  )

  // Load images as Konva image objects
  const [loadedImages, setLoadedImages] = useState<Map<string, HTMLImageElement>>(new Map())
  useEffect(() => {
    images.forEach((img) => {
      if (!loadedImages.has(img.id)) {
        const htmlImg = new window.Image()
        htmlImg.src = img.data
        htmlImg.onload = () => {
          setLoadedImages((prev) => new Map(prev).set(img.id, htmlImg))
        }
      }
    })
  }, [images])

  const isDrawingTool = activeTool !== 'select'
  const cursor = spaceHeld || isPanning ? 'grab' : activeTool === 'eyedropper' ? 'crosshair' : isDrawingTool ? 'crosshair' : 'default'

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-neutral-900 relative"
      style={{ cursor }}
    >
      <InlineTextEditor />
      <ToolHint />
      {/* Eyedropper loupe overlay */}
      {eyedropperActive && (
        <>
          <canvas
            ref={loupeRef}
            width={LOUPE_SIZE}
            height={LOUPE_SIZE}
            className="fixed z-50 pointer-events-none border-2 border-white rounded-full shadow-2xl"
            style={{ imageRendering: 'pixelated', clipPath: 'circle(50%)' }}
          />
          <div id="eyedropper-label" className="fixed z-50 pointer-events-none text-center text-xs font-mono text-white bg-black/80 rounded px-2 py-0.5">
            {eyedropperColor}
          </div>
        </>
      )}
      <Stage
        ref={stageRef}
        width={containerSize.width}
        height={containerSize.height}
        scaleX={zoom}
        scaleY={zoom}
        x={stagePos.x}
        y={stagePos.y}
        onWheel={handleWheel}
        onMouseDown={(e) => { handleEyedropperDown(e); handlePanMouseDown(e); handleSelBoxStart(e); if (!spaceHeld && e.evt.button !== 1) onMouseDown(e) }}
        onMouseMove={(e) => { handleEyedropperMove(e); handlePanMouseMove(e); handleSelBoxMove(e); if (!isPanning) onMouseMove(e) }}
        onMouseUp={() => { handleEyedropperUp(); handlePanMouseUp(); handleSelBoxEnd(); if (!isPanning) onMouseUp() }}
        onClick={(e) => { if (!spaceHeld) handleStageClick(e) }}
        onDblClick={handleDblClick}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        draggable={false}
      >
        {/* Background / canvas area */}
        <Layer>
          <Rect
            id="canvas-bg"
            x={0}
            y={0}
            width={canvasWidth}
            height={canvasHeight}
            fill={canvasBgColor}
            shadowColor="#000"
            shadowBlur={20}
            shadowOpacity={0.3}
          />

          {/* Grid overlay */}
          {showGrid &&
            Array.from({ length: Math.ceil(canvasWidth / 50) + 1 }).map((_, i) => (
              <Rect
                key={`gv-${i}`}
                x={i * 50}
                y={0}
                width={0.5}
                height={canvasHeight}
                fill="#ddd"
                listening={false}
              />
            ))}
          {showGrid &&
            Array.from({ length: Math.ceil(canvasHeight / 50) + 1 }).map((_, i) => (
              <Rect
                key={`gh-${i}`}
                x={0}
                y={i * 50}
                width={canvasWidth}
                height={0.5}
                fill="#ddd"
                listening={false}
              />
            ))}
        </Layer>

        {/* Images layer */}
        <Layer>
          {images
            .filter((img) => img.role !== 'alternative' || img.visible !== false)
            .map((img) => {
              const htmlImg = loadedImages.get(img.id)
              if (!htmlImg) return null
              return (
                <KonvaImage
                  key={img.id}
                  id={img.id}
                  image={htmlImg}
                  x={img.x}
                  y={img.y}
                  width={img.width}
                  height={img.height}
                  rotation={img.rotation || 0}
                  scaleX={img.flipX ? -1 : 1}
                  scaleY={img.flipY ? -1 : 1}
                  offsetX={img.flipX ? img.width : 0}
                  offsetY={img.flipY ? img.height : 0}
                  opacity={img.opacity ?? 1}
                  crop={img.cropWidth ? {
                    x: img.cropX || 0,
                    y: img.cropY || 0,
                    width: img.cropWidth,
                    height: img.cropHeight || img.naturalHeight,
                  } : undefined}
                  filters={img.brightness !== undefined || img.contrast !== undefined ? [Konva.Filters.Brighten, Konva.Filters.Contrast] : undefined}
                  brightness={img.brightness ?? 0}
                  contrast={img.contrast ?? 0}
                  draggable={activeTool === 'select' && !img.locked}
                  onClick={(e) => {
                    if (activeTool === 'select') {
                      e.cancelBubble = true
                      if (e.evt.shiftKey) {
                        const current = useEditorStore.getState().selectedIds
                        if (current.includes(img.id)) {
                          setSelectedIds(current.filter((i) => i !== img.id))
                        } else {
                          setSelectedIds([...current, img.id])
                        }
                      } else {
                        setSelectedIds([img.id])
                      }
                      const cropping = useEditorStore.getState().croppingImageId
                      if (cropping && cropping !== img.id) {
                        useEditorStore.getState().setCroppingImageId(null)
                      }
                    }
                  }}
                  onDragEnd={(e) => {
                    pushHistory()
                    updateImage(img.id, {
                      x: Math.round(e.target.x()),
                      y: Math.round(e.target.y()),
                    })
                  }}
                  onTransform={(e) => {
                    // During crop mode: apply crop in real-time instead of scaling
                    if (useEditorStore.getState().croppingImageId !== img.id) return
                    const node = e.target
                    const sx = node.scaleX()
                    const sy = node.scaleY()
                    let newW = node.width() * sx
                    let newH = node.height() * sy
                    let newX = node.x()
                    let newY = node.y()

                    const srcW = img.cropWidth || img.naturalWidth
                    const srcH = img.cropHeight || img.naturalHeight
                    const ratioX = srcW / img.width
                    const ratioY = srcH / img.height

                    // Clamp: don't allow expanding beyond full image
                    const maxW = img.naturalWidth / ratioX
                    const maxH = img.naturalHeight / ratioY
                    if (newW > maxW) { newW = maxW; newX = img.x }
                    if (newH > maxH) { newH = maxH; newY = img.y }

                    const dxD = newX - img.x
                    const dyD = newY - img.y
                    const dwD = newW - img.width
                    const dhD = newH - img.height

                    // Reset scale and apply as crop + size change
                    node.scaleX(1)
                    node.scaleY(1)
                    node.width(Math.round(newW))
                    node.height(Math.round(newH))
                    node.x(Math.round(newX))
                    node.y(Math.round(newY))

                    updateImage(img.id, {
                      x: Math.round(newX),
                      y: Math.round(newY),
                      width: Math.round(newW),
                      height: Math.round(newH),
                      cropX: Math.max(0, Math.min(img.naturalWidth - 10, Math.round((img.cropX || 0) + dxD * ratioX))),
                      cropY: Math.max(0, Math.min(img.naturalHeight - 10, Math.round((img.cropY || 0) + dyD * ratioY))),
                      cropWidth: Math.max(10, Math.min(img.naturalWidth, Math.round(srcW + dwD * ratioX))),
                      cropHeight: Math.max(10, Math.min(img.naturalHeight, Math.round(srcH + dhD * ratioY))),
                    })
                  }}
                  onTransformEnd={(e) => {
                    const node = e.target
                    pushHistory()
                    const isCropping = useEditorStore.getState().croppingImageId === img.id

                    if (isCropping) {
                      // Already applied during onTransform, just reset scale
                      node.scaleX(1)
                      node.scaleY(1)
                    } else {
                      updateImage(img.id, {
                        x: Math.round(node.x()),
                        y: Math.round(node.y()),
                        width: Math.round(node.width() * node.scaleX()),
                        height: Math.round(node.height() * node.scaleY()),
                        rotation: Math.round(node.rotation()),
                      })
                    }
                    node.scaleX(1)
                    node.scaleY(1)
                  }}
                />
              )
            })}
        </Layer>

        {/* Annotations layer */}
        <Layer>
          <AnnotationRenderer stageRef={stageRef} />
          <ConnectorRenderer />
          {/* Selection box */}
          {selectionBox && (
            <Rect
              x={selectionBox.x}
              y={selectionBox.y}
              width={selectionBox.w}
              height={selectionBox.h}
              stroke="#6366f1"
              strokeWidth={1}
              dash={[6, 3]}
              fill="rgba(99,102,241,0.08)"
              listening={false}
            />
          )}
          <Transformer
            ref={transformerRef}
            keepRatio={shiftHeld}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 5 || newBox.height < 5) return oldBox
              return newBox
            }}
          />
        </Layer>
      </Stage>
    </div>
  )
}

function ToolHint() {
  const activeTool = useEditorStore((s) => s.activeTool)
  const pendingRoiId = useEditorStore((s) => s.pendingConnectorRoiId)
  const croppingImageId = useEditorStore((s) => s.croppingImageId)

  if (croppingImageId) {
    return (
      <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 bg-amber-900/90 border border-amber-600 rounded-lg px-4 py-2 text-xs text-amber-100 shadow-lg pointer-events-none">
        Crop mode -- drag handles to crop image. Press Escape or click elsewhere to exit.
      </div>
    )
  }

  const hints: Record<string, string> = {
    connector: pendingRoiId
      ? 'Now click on the detail/magnification image to connect'
      : 'Click on the overview image to mark a region of interest',
    textbox: 'Draw a rectangle, then type your text',
    dimension: 'Draw a line between two points to measure distance',
  }

  const hint = hints[activeTool]
  if (!hint) return null

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 bg-surface-overlay/95 border border-border rounded-lg px-4 py-2 text-xs text-gray-300 shadow-lg pointer-events-none">
      {hint}
    </div>
  )
}

