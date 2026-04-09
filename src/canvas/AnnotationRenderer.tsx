// Renders every annotation in the current project as the matching
// Konva node. Each type in the discriminated union gets its own small
// renderer branch so we can keep the per-shape props tidy instead of
// one mega-switch. The file is long but most of its length is the
// shape-by-shape props translation; the shared bits (selection,
// transform handles, drag/update wiring) live at the top.

import React, { useRef, useEffect, useCallback, useState } from 'react'
import Konva from 'konva'
import { Arrow, Text, Rect, Ellipse, Line, Circle, Group } from 'react-konva'
import { useProjectStore } from '../stores/projectStore'
import { useEditorStore } from '../stores/editorStore'
import { Annotation, TextAnnotation, TextBoxAnnotation, DimensionAnnotation, StampAnnotation } from '../types'
import { BlurRegion } from './objects/BlurRegion'

import { DashStyle } from '../types'

function dashArray(style?: DashStyle, strokeWidth = 2): number[] | undefined {
  if (!style || style === 'solid') return undefined
  if (style === 'dashed') return [strokeWidth * 4, strokeWidth * 3]
  if (style === 'dotted') return [strokeWidth, strokeWidth * 2]
  return undefined
}

// Consistent shadow settings
const SHADOW = {
  color: 'rgba(0,0,0,0.3)',
  blur: 6,
  offsetX: 1,
  offsetY: 2,
  enabled: true,
} as const

interface Props {
  stageRef: React.RefObject<Konva.Stage | null>
}

/** Text label with properly measured background */
function TextLabel({
  ann,
  common,
}: {
  ann: TextAnnotation
  common: Record<string, any>
}) {
  const textRef = useRef<Konva.Text>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)

  const pad = ann.padding ?? 6

  const measure = useCallback(() => {
    const node = textRef.current
    if (!node) return
    const w = node.width()
    const h = node.height()
    if (w > 0 && h > 0) {
      setSize({ w, h })
    }
  }, [])

  useEffect(() => {
    measure()
  }, [ann.text, ann.fontSize, ann.fontFamily, ann.bold, ann.italic, ann.padding, measure])

  // Raw text size (no padding) + uniform padding on all sides
  const rawW = size?.w ?? ann.text.length * ann.fontSize * 0.7
  const rawH = size?.h ?? ann.fontSize * 1.3
  const bgW = rawW + pad * 2
  const bgH = rawH + pad * 2

  return (
    <Group key={ann.id} {...common}>
      {ann.backgroundColor && (
        <Rect
          x={-pad}
          y={-pad}
          fill={ann.backgroundColor}
          cornerRadius={5}
          listening={false}
          width={bgW}
          height={bgH}
          opacity={ann.opacity ?? 1}
          shadowColor={SHADOW.color}
          shadowBlur={SHADOW.blur}
          shadowOffsetX={SHADOW.offsetX}
          shadowOffsetY={SHADOW.offsetY}
          shadowEnabled={SHADOW.enabled}
        />
      )}
      <Text
        ref={textRef}
        text={ann.text}
        fontSize={ann.fontSize}
        fontFamily={ann.fontFamily}
        fill={ann.fill}
        fontStyle={
          (ann.bold ? 'bold' : '') + (ann.italic ? ' italic' : '') || 'normal'
        }
        lineHeight={1.2}
        onSync={measure}
      />
    </Group>
  )
}

/** Text box with auto-sizing border -- uniform padding via manual positioning */
function TextBoxLabel({
  ann,
  common,
}: {
  ann: TextBoxAnnotation
  common: Record<string, any>
}) {
  const textRef = useRef<Konva.Text>(null)
  const [textSize, setTextSize] = useState<{ w: number; h: number } | null>(null)

  // Default padding proportional to font size (60% of fontSize, min 4)
  const pad = ann.padding ?? Math.max(4, Math.round(ann.fontSize * 0.6))

  const measure = useCallback(() => {
    const node = textRef.current
    if (!node) return
    // Measure raw text size (no padding -- padding=0 on the Text node)
    const w = node.width()
    const h = node.height()
    if (w > 0 && h > 0) {
      setTextSize({ w, h })
    }
  }, [])

  useEffect(() => {
    measure()
  }, [ann.text, ann.fontSize, ann.fontFamily, ann.bold, ann.italic, ann.padding, measure])

  // Box = raw text size + uniform padding on all sides
  const rawW = textSize?.w ?? (ann.text.split('\n').reduce((max, line) => Math.max(max, line.length), 0)) * ann.fontSize * 0.7
  const rawH = textSize?.h ?? ann.text.split('\n').length * ann.fontSize * 1.4
  const boxW = rawW + pad * 2
  const boxH = rawH + pad * 2

  return (
    <Group key={ann.id} {...common}>
      <Rect
        width={boxW}
        height={boxH}
        fill={ann.backgroundColor}
        stroke={ann.borderColor}
        strokeWidth={ann.borderWidth}
        cornerRadius={ann.borderRadius}
        shadowColor={SHADOW.color}
        shadowBlur={SHADOW.blur}
        shadowOffsetX={SHADOW.offsetX}
        shadowOffsetY={SHADOW.offsetY}
        shadowEnabled={SHADOW.enabled}
      />
      <Text
        ref={textRef}
        x={pad}
        y={pad}
        text={ann.text}
        fontSize={ann.fontSize}
        fontFamily={ann.fontFamily}
        fill={ann.fill}
        fontStyle={
          (ann.bold ? 'bold' : '') + (ann.italic ? ' italic' : '') || 'normal'
        }
        align={ann.textAlign || 'left'}
        lineHeight={1.2}
        onSync={measure}
      />
    </Group>
  )
}

export function AnnotationRenderer({ stageRef }: Props) {
  const annotations = useProjectStore((s) => s.annotations)
  const updateAnnotation = useProjectStore((s) => s.updateAnnotation)
  const pushHistory = useProjectStore((s) => s.pushHistory)
  const activeTool = useEditorStore((s) => s.activeTool)
  const setSelectedIds = useEditorStore((s) => s.setSelectedIds)

  const isDraggable = activeTool === 'select'

  const handleSelect = (id: string) => (e: any) => {
    if (activeTool !== 'select') return
    e.cancelBubble = true
    if (e.evt?.shiftKey) {
      // Shift+click: toggle in selection
      const current = useEditorStore.getState().selectedIds
      if (current.includes(id)) {
        setSelectedIds(current.filter((i) => i !== id))
      } else {
        setSelectedIds([...current, id])
      }
    } else {
      setSelectedIds([id])
    }
  }

  const handleDragEnd = (ann: Annotation) => (e: Konva.KonvaEventObject<DragEvent>) => {
    pushHistory()
    let x = Math.round(e.target.x())
    let y = Math.round(e.target.y())
    // Ellipse renders at center (ann.x + radiusX), so subtract offset to get top-left
    if (ann.type === 'ellipse') {
      x -= (ann as any).radiusX
      y -= (ann as any).radiusY
    }
    updateAnnotation(ann.id, { x, y })
  }

  const handleTransformEnd = (ann: Annotation) => (e: Konva.KonvaEventObject<Event>) => {
    const node = e.target
    pushHistory()
    const scaleX = node.scaleX()
    const scaleY = node.scaleY()

    let x = Math.round(node.x())
    let y = Math.round(node.y())

    const patch: Partial<Annotation> = {
      x, y,
      rotation: node.rotation(),
    }

    if ('width' in ann && 'height' in ann) {
      ;(patch as any).width = Math.round((ann as any).width * scaleX)
      ;(patch as any).height = Math.round((ann as any).height * scaleY)
    }
    if ('radiusX' in ann) {
      ;(patch as any).radiusX = Math.round((ann as any).radiusX * scaleX)
      ;(patch as any).radiusY = Math.round((ann as any).radiusY * scaleY)
      // Ellipse center offset: convert back to top-left
      patch.x = x - Math.round((ann as any).radiusX * scaleX)
      patch.y = y - Math.round((ann as any).radiusY * scaleY)
    }
    if (ann.type === 'counter') {
      const scale = (scaleX + scaleY) / 2
      const newRadius = Math.max(8, Math.round((ann as any).radius * scale))
      ;(patch as any).radius = newRadius
      ;(patch as any).fontSize = newRadius
    }

    node.scaleX(1)
    node.scaleY(1)
    updateAnnotation(ann.id, patch)
  }

  // Render counters last so they always appear on top
  const sorted = [...annotations].sort((a, b) => {
    const aCounter = a.type === 'counter' ? 1 : 0
    const bCounter = b.type === 'counter' ? 1 : 0
    return aCounter - bCounter
  })

  return (
    <>
      {sorted.map((ann) => {
        const common = {
          id: ann.id,
          x: ann.x,
          y: ann.y,
          rotation: ann.rotation || 0,
          opacity: ann.opacity ?? 1,
          draggable: isDraggable,
          onClick: handleSelect(ann.id),
          onDragEnd: handleDragEnd(ann),
          onTransformEnd: handleTransformEnd(ann),
        }

        switch (ann.type) {
          case 'arrow':
            return (
              <Arrow
                key={ann.id}
                {...common}
                points={ann.points}
                stroke={ann.stroke}
                strokeWidth={ann.strokeWidth}
                pointerLength={ann.headSize * 1.4}
                pointerWidth={ann.headSize * 0.85}
                fill={ann.stroke}
                pointerAtBeginning={ann.doubleHead ?? false}
                dash={dashArray(ann.dash, ann.strokeWidth)}
                hitStrokeWidth={20}
                lineCap="round"
                lineJoin="round"
                shadowColor={SHADOW.color}
                shadowBlur={SHADOW.blur}
                shadowOffsetX={SHADOW.offsetX}
                shadowOffsetY={SHADOW.offsetY}
                shadowEnabled={SHADOW.enabled}
              />
            )

          case 'text':
            return (
              <TextLabel key={ann.id} ann={ann} common={common} />
            )

          case 'highlight':
            return (
              <Rect
                key={ann.id}
                {...common}
                width={ann.width}
                height={ann.height}
                fill={ann.fill}
                opacity={ann.opacity}
                cornerRadius={3}
              />
            )

          case 'blur':
            return (
              <BlurRegion
                key={ann.id}
                annotation={ann}
                stageRef={stageRef}
                commonProps={common}
              />
            )

          case 'rectangle':
            return (
              <Rect
                key={ann.id}
                {...common}
                width={ann.width}
                height={ann.height}
                stroke={ann.stroke}
                strokeWidth={ann.strokeWidth}
                fill={ann.fill || undefined}
                cornerRadius={ann.cornerRadius ?? 6}
                dash={dashArray(ann.dash, ann.strokeWidth)}
                lineCap="round"
                lineJoin="round"
                shadowColor={SHADOW.color}
                shadowBlur={SHADOW.blur}
                shadowOffsetX={SHADOW.offsetX}
                shadowOffsetY={SHADOW.offsetY}
                shadowEnabled={SHADOW.enabled}
              />
            )

          case 'ellipse':
            return (
              <Ellipse
                key={ann.id}
                {...common}
                x={ann.x + ann.radiusX}
                y={ann.y + ann.radiusY}
                radiusX={ann.radiusX}
                radiusY={ann.radiusY}
                stroke={ann.stroke}
                strokeWidth={ann.strokeWidth}
                hitStrokeWidth={20}
                fill={ann.fill || undefined}
                shadowColor={SHADOW.color}
                shadowBlur={SHADOW.blur}
                shadowOffsetX={SHADOW.offsetX}
                shadowOffsetY={SHADOW.offsetY}
                shadowEnabled={SHADOW.enabled}
              />
            )

          case 'line':
            return (
              <Line
                key={ann.id}
                {...common}
                points={ann.points}
                stroke={ann.stroke}
                strokeWidth={ann.strokeWidth}
                dash={dashArray(ann.dash, ann.strokeWidth)}
                hitStrokeWidth={20}
                lineCap="round"
                lineJoin="round"
                shadowColor={SHADOW.color}
                shadowBlur={SHADOW.blur}
                shadowOffsetX={SHADOW.offsetX}
                shadowOffsetY={SHADOW.offsetY}
                shadowEnabled={SHADOW.enabled}
              />
            )

          case 'draw':
            return (
              <Line
                key={ann.id}
                {...common}
                points={ann.points}
                stroke={ann.stroke}
                strokeWidth={ann.strokeWidth}
                hitStrokeWidth={Math.max(20, ann.strokeWidth + 14)}
                tension={0.3}
                lineCap="round"
                lineJoin="round"
                shadowColor={SHADOW.color}
                shadowBlur={SHADOW.blur}
                shadowOffsetX={SHADOW.offsetX}
                shadowOffsetY={SHADOW.offsetY}
                shadowEnabled={SHADOW.enabled}
              />
            )

          case 'colorbox':
            return (
              <Rect
                key={ann.id}
                {...common}
                width={ann.width}
                height={ann.height}
                fill={ann.fill}
                cornerRadius={4}
              />
            )

          case 'counter':
            return (
              <Group key={ann.id} {...common}>
                <Circle
                  radius={ann.radius}
                  fill="#0f172a"
                  stroke={ann.fill}
                  strokeWidth={3}
                  shadowColor={ann.fill}
                  shadowBlur={10}
                  shadowOpacity={0.5}
                  shadowEnabled={true}
                />
                <Circle
                  radius={ann.radius - 4}
                  fill="transparent"
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth={1}
                />
                <Text
                  text={String(ann.number)}
                  fontSize={ann.fontSize}
                  fill="#ffffff"
                  fontStyle="bold"
                  fontFamily="sans-serif"
                  align="center"
                  verticalAlign="middle"
                  width={ann.radius * 2}
                  height={ann.radius * 2}
                  offsetX={ann.radius}
                  offsetY={ann.radius}
                />
              </Group>
            )

          case 'textbox': {
            const tb = ann as TextBoxAnnotation
            return (
              <TextBoxLabel key={ann.id} ann={tb} common={common} />
            )
          }

          case 'dimension': {
            const dim = ann as DimensionAnnotation
            const [x1, y1, x2, y2] = dim.points
            const dx = x2 - x1, dy = y2 - y1
            const angle = Math.atan2(dy, dx)
            const nx = -Math.sin(angle) * dim.capSize / 2
            const ny = Math.cos(angle) * dim.capSize / 2
            const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
            const label = dim.label || ''
            return (
              <Group key={ann.id} {...common}>
                {/* Main line */}
                <Line points={[x1, y1, x2, y2]} stroke={dim.stroke} strokeWidth={dim.strokeWidth} lineCap="round" />
                {/* End caps */}
                <Line points={[x1 + nx, y1 + ny, x1 - nx, y1 - ny]} stroke={dim.stroke} strokeWidth={dim.strokeWidth} lineCap="round" />
                <Line points={[x2 + nx, y2 + ny, x2 - nx, y2 - ny]} stroke={dim.stroke} strokeWidth={dim.strokeWidth} lineCap="round" />
                {/* Label background + text */}
                {label && (
                  <>
                    <Rect
                      x={mx - label.length * dim.fontSize * 0.3 - 4}
                      y={my - dim.fontSize - 8}
                      width={label.length * dim.fontSize * 0.6 + 8}
                      height={dim.fontSize + 6}
                      fill="rgba(255,255,255,0.9)"
                      cornerRadius={3}
                    />
                    <Text
                      x={mx}
                      y={my - dim.fontSize - 5}
                      text={label}
                      fontSize={dim.fontSize}
                      fontFamily="sans-serif"
                      fill={dim.stroke}
                      align="center"
                      offsetX={label.length * dim.fontSize * 0.3}
                    />
                  </>
                )}
              </Group>
            )
          }

          case 'stamp': {
            const st = ann as StampAnnotation
            return (
              <Group key={ann.id} {...common}>
                <Rect
                  width={st.text.length * st.fontSize * 0.75 + 30}
                  height={st.fontSize + 20}
                  stroke={st.borderColor}
                  strokeWidth={3}
                  cornerRadius={4}
                  dash={[8, 4]}
                  opacity={0.7}
                />
                <Text
                  x={15}
                  y={10}
                  text={st.text}
                  fontSize={st.fontSize}
                  fontFamily="sans-serif"
                  fontStyle="bold"
                  fill={st.fill}
                  letterSpacing={st.fontSize * 0.15}
                />
              </Group>
            )
          }

          default:
            return null
        }
      })}
    </>
  )
}
