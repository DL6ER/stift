// Connectors are the lines that join two anchor points (typically a
// counter / dimension to a region of interest on the image). They
// re-route automatically when either endpoint moves, which is what
// keeps this in its own file rather than as another branch of
// AnnotationRenderer: the routing math is non-trivial and lives next
// to the ROI box rendering it shares.

import Konva from 'konva'
import { Line, Rect, Text, Group } from 'react-konva'
import { useProjectStore } from '../../stores/projectStore'
import { useEditorStore } from '../../stores/editorStore'

export function ConnectorRenderer() {
  const connectors = useProjectStore((s) => s.connectors)
  const rois = useProjectStore((s) => s.rois)
  const images = useProjectStore((s) => s.images)
  const selectedIds = useEditorStore((s) => s.selectedIds)
  const setSelectedIds = useEditorStore((s) => s.setSelectedIds)
  const activeTool = useEditorStore((s) => s.activeTool)

  const handleClick = (id: string) => (e: any) => {
    if (activeTool !== 'select') return
    e.cancelBubble = true
    setSelectedIds([id])
  }

  // Build a map: roiId -> connector (to get color/width from connector for ROI rendering)
  const roiConnectorMap = new Map<string, typeof connectors[0]>()
  for (const conn of connectors) {
    roiConnectorMap.set(conn.fromRoiId, conn)
  }

  return (
    <>
      {/* Render ROIs as colored rectangles on their parent images */}
      {rois.map((roi) => {
        const parentImg = images.find((img) => img.id === roi.imageId)
        if (!parentImg) return null
        const absX = parentImg.x + roi.x
        const absY = parentImg.y + roi.y
        const isSelected = selectedIds.includes(roi.id)
        const isDraggable = activeTool === 'select'

        // Use connector's color/width if available, otherwise fall back to ROI defaults
        const conn = roiConnectorMap.get(roi.id)
        const color = conn?.color || roi.color
        const sw = conn?.strokeWidth || 2

        const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
          useProjectStore.getState().pushHistory()
          useProjectStore.getState().updateROI(roi.id, {
            x: Math.round(e.target.x() - parentImg.x),
            y: Math.round(e.target.y() - parentImg.y),
          })
        }

        const handleTransformEnd = (e: Konva.KonvaEventObject<Event>) => {
          const node = e.target
          useProjectStore.getState().pushHistory()
          useProjectStore.getState().updateROI(roi.id, {
            x: Math.round(node.x() - parentImg.x),
            y: Math.round(node.y() - parentImg.y),
            width: Math.round(node.width() * node.scaleX()),
            height: Math.round(node.height() * node.scaleY()),
          })
          node.scaleX(1)
          node.scaleY(1)
        }

        return (
          <Group key={roi.id}>
            <Rect
              id={roi.id}
              x={absX}
              y={absY}
              width={roi.width}
              height={roi.height}
              stroke={isSelected ? '#fff' : color}
              strokeWidth={isSelected ? sw + 1 : sw}
              cornerRadius={3}
              dash={[6, 3]}
              hitStrokeWidth={10}
              draggable={isDraggable}
              onClick={handleClick(roi.id)}
              onDragEnd={handleDragEnd}
              onTransformEnd={handleTransformEnd}
            />
            <Text
              x={absX}
              y={absY - 16}
              text={String(roi.number)}
              fontSize={12}
              fontStyle="bold"
              fill={color}
              padding={2}
              listening={false}
            />
          </Group>
        )
      })}

      {/* Render colored borders on target (detail) images */}
      {connectors.map((conn) => {
        const targetImg = images.find((img) => img.id === conn.toImageId)
        if (!targetImg) return null
        const sw = conn.strokeWidth || 2
        return (
          <Rect
            key={`border-${conn.id}`}
            x={targetImg.x}
            y={targetImg.y}
            width={targetImg.width}
            height={targetImg.height}
            stroke={conn.color}
            strokeWidth={Math.max(3, sw + 1)}
            cornerRadius={3}
            listening={false}
          />
        )
      })}

      {/* Render connector lines between ROIs and target images */}
      {connectors.map((conn) => {
        const roi = rois.find((r) => r.id === conn.fromRoiId)
        const targetImg = images.find((img) => img.id === conn.toImageId)
        if (!roi || !targetImg) return null

        const parentImg = images.find((img) => img.id === roi.imageId)
        if (!parentImg) return null

        const roiCx = parentImg.x + roi.x + roi.width / 2
        const roiCy = parentImg.y + roi.y + roi.height / 2
        const imgCx = targetImg.x + targetImg.width / 2
        const imgCy = targetImg.y + targetImg.height / 2

        const edgePoint = nearestEdgePoint(
          roiCx, roiCy,
          targetImg.x, targetImg.y, targetImg.width, targetImg.height
        )
        const roiEdge = nearestEdgePoint(
          imgCx, imgCy,
          parentImg.x + roi.x, parentImg.y + roi.y, roi.width, roi.height
        )

        let points: number[]
        let tension = 0

        if (conn.style === 'straight') {
          points = [roiEdge.x, roiEdge.y, edgePoint.x, edgePoint.y]
        } else if (conn.style === 'orthogonal') {
          const mx = (roiEdge.x + edgePoint.x) / 2
          points = [roiEdge.x, roiEdge.y, mx, roiEdge.y, mx, edgePoint.y, edgePoint.x, edgePoint.y]
        } else {
          // Curved: offset a control point perpendicular to the straight line
          const dx = edgePoint.x - roiEdge.x
          const dy = edgePoint.y - roiEdge.y
          const len = Math.sqrt(dx * dx + dy * dy)
          const offset = len * 0.3
          // Perpendicular direction
          const nx = -dy / (len || 1)
          const ny = dx / (len || 1)
          const cx1 = roiEdge.x + dx * 0.33 + nx * offset
          const cy1 = roiEdge.y + dy * 0.33 + ny * offset
          const cx2 = roiEdge.x + dx * 0.66 - nx * offset * 0.5
          const cy2 = roiEdge.y + dy * 0.66 - ny * offset * 0.5
          points = [roiEdge.x, roiEdge.y, cx1, cy1, cx2, cy2, edgePoint.x, edgePoint.y]
          tension = 0.4
        }

        const isSelected = selectedIds.includes(conn.id)
        const sw = conn.strokeWidth || 2

        return (
          <Line
            key={conn.id}
            id={conn.id}
            points={points}
            stroke={isSelected ? '#fff' : conn.color}
            strokeWidth={isSelected ? sw + 1.5 : sw}
            lineCap="round"
            lineJoin="round"
            tension={tension}
            dash={[8, 4]}
            opacity={isSelected ? 1 : 0.8}
            hitStrokeWidth={14}
            onClick={handleClick(conn.id)}
          />
        )
      })}
    </>
  )
}

function nearestEdgePoint(
  fromX: number, fromY: number,
  rectX: number, rectY: number, rectW: number, rectH: number
) {
  const cx = rectX + rectW / 2
  const cy = rectY + rectH / 2
  const dx = fromX - cx
  const dy = fromY - cy

  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
    return { x: rectX, y: cy }
  }

  const scaleX = Math.abs(dx) > 0 ? (rectW / 2) / Math.abs(dx) : Infinity
  const scaleY = Math.abs(dy) > 0 ? (rectH / 2) / Math.abs(dy) : Infinity
  const scale = Math.min(scaleX, scaleY)

  return { x: cx + dx * scale, y: cy + dy * scale }
}
