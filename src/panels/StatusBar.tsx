// Bottom status strip. Shows the current zoom, the canvas size, the
// number of selected annotations, and the privacy badge that
// reminds users everything is processed locally. Footer links from
// the FOOTER_LINKS env var get rendered here when the operator
// configured any.

import { ShieldCheck, Maximize, ScanSearch } from 'lucide-react'
import { useEditorStore } from '../stores/editorStore'
import { useProjectStore } from '../stores/projectStore'
import { useConfigStore } from '../stores/configStore'

export function StatusBar() {
  const zoom = useEditorStore((s) => s.zoom)
  const activeTool = useEditorStore((s) => s.activeTool)
  const canvasWidth = useProjectStore((s) => s.canvasWidth)
  const canvasHeight = useProjectStore((s) => s.canvasHeight)
  const annotations = useProjectStore((s) => s.annotations)
  const images = useProjectStore((s) => s.images)
  const devMode = useConfigStore((s) => s.devMode)
  const footerLinks = useConfigStore((s) => s.footerLinks)
  const sponsorUrl = useConfigStore((s) => s.sponsorUrl)

  const store = useProjectStore.getState()

  const handleZoomToFit = () => {
    const container = document.querySelector('.bg-neutral-900')
    if (!container) return
    const cw = container.clientWidth
    const ch = container.clientHeight
    const padding = 60
    const scaleX = (cw - padding * 2) / canvasWidth
    const scaleY = (ch - padding * 2) / canvasHeight
    const newZoom = Math.min(scaleX, scaleY, 3)
    useEditorStore.getState().setZoom(newZoom)
    useEditorStore.getState().setStagePos({
      x: (cw - canvasWidth * newZoom) / 2,
      y: (ch - canvasHeight * newZoom) / 2,
    })
  }

  const privacyTooltip = 'All editing happens in your browser. No data is sent to any external service.'

  const handleFitCanvas = () => {
    const store = useProjectStore.getState()
    const PADDING = 0
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

    for (const img of store.images) {
      minX = Math.min(minX, img.x)
      minY = Math.min(minY, img.y)
      maxX = Math.max(maxX, img.x + img.width)
      maxY = Math.max(maxY, img.y + img.height)
    }
    for (const ann of store.annotations) {
      if ('width' in ann && 'height' in ann) {
        const a = ann as any
        minX = Math.min(minX, a.x)
        minY = Math.min(minY, a.y)
        maxX = Math.max(maxX, a.x + a.width)
        maxY = Math.max(maxY, a.y + a.height)
      } else if ('radiusX' in ann) {
        const a = ann as any
        minX = Math.min(minX, a.x)
        minY = Math.min(minY, a.y)
        maxX = Math.max(maxX, a.x + a.radiusX * 2)
        maxY = Math.max(maxY, a.y + a.radiusY * 2)
      } else if ('points' in ann) {
        const pts = (ann as any).points as number[]
        for (let i = 0; i < pts.length; i += 2) {
          minX = Math.min(minX, pts[i])
          maxX = Math.max(maxX, pts[i])
          minY = Math.min(minY, pts[i + 1])
          maxY = Math.max(maxY, pts[i + 1])
        }
      } else {
        minX = Math.min(minX, ann.x - 30)
        minY = Math.min(minY, ann.y - 30)
        maxX = Math.max(maxX, ann.x + 30)
        maxY = Math.max(maxY, ann.y + 30)
      }
    }

    if (!isFinite(minX)) return

    const newW = Math.max(200, Math.round(maxX - minX + PADDING * 2))
    const newH = Math.max(200, Math.round(maxY - minY + PADDING * 2))
    const dx = PADDING - minX
    const dy = PADDING - minY

    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
      store.pushHistory()
      for (const img of store.images) {
        store.updateImage(img.id, { x: img.x + dx, y: img.y + dy })
      }
      for (const ann of store.annotations) {
        if ('points' in ann) {
          const pts = [...(ann as any).points] as number[]
          for (let i = 0; i < pts.length; i += 2) {
            pts[i] += dx
            pts[i + 1] += dy
          }
          store.updateAnnotation(ann.id, { points: pts } as any)
        } else {
          store.updateAnnotation(ann.id, { x: ann.x + dx, y: ann.y + dy })
        }
      }
    }

    store.setProjectMeta(store.projectName, newW, newH)
  }

  return (
    <div className="h-7 bg-surface-raised border-t border-border flex items-center px-3 gap-6 text-xs text-gray-500 shrink-0">
      <span
        className="flex items-center gap-1.5 cursor-default text-emerald-500"
        title={privacyTooltip}
      >
        <ShieldCheck size={12} />
        Client-side only
      </span>
      {devMode && (
        <span
          className="flex items-center gap-1.5 cursor-default text-amber-400"
          title="DEV_MODE is enabled on this server. Verbose request logging is active in the container. Do not use in production."
        >
          ⚠ DEV MODE
        </span>
      )}
      {useProjectStore.getState().isDirty && <span className="text-amber-400" title="Unsaved changes">*</span>}
      <span>Tool: <span className="text-gray-300">{activeTool}</span></span>
      <span className="flex items-center gap-1.5">
        Canvas:
        <input type="number" value={canvasWidth} onChange={(e) => store.setProjectMeta(store.projectName, Number(e.target.value), canvasHeight)}
          className="w-12 bg-transparent border-b border-transparent hover:border-gray-500 focus:border-accent text-gray-300 text-xs text-center outline-none" />
        x
        <input type="number" value={canvasHeight} onChange={(e) => store.setProjectMeta(store.projectName, canvasWidth, Number(e.target.value))}
          className="w-12 bg-transparent border-b border-transparent hover:border-gray-500 focus:border-accent text-gray-300 text-xs text-center outline-none" />
        <button
          onClick={handleFitCanvas}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-gray-400 hover:text-gray-200 hover:bg-surface-overlay transition-colors"
          title="Fit canvas to content"
        >
          <Maximize size={11} />
          <span>Fit</span>
        </button>
        <button
          onClick={handleZoomToFit}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-gray-400 hover:text-gray-200 hover:bg-surface-overlay transition-colors"
          title="Zoom to fit canvas in view"
        >
          <ScanSearch size={11} />
          <span>View</span>
        </button>
      </span>
      <span>Zoom: {Math.round(zoom * 100)}%</span>
      <span className="flex items-center gap-1">
        BG:
        {['#ffffff', '#f0f0f0', '#333333', '#000000', 'transparent'].map((c) => (
          <button key={c} onClick={() => useEditorStore.getState().setCanvasBgColor(c)}
            className={`w-3.5 h-3.5 rounded-sm border ${useEditorStore.getState().canvasBgColor === c ? 'border-accent' : 'border-gray-600'}`}
            style={{ backgroundColor: c === 'transparent' ? undefined : c, backgroundImage: c === 'transparent' ? 'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%)' : undefined, backgroundSize: '6px 6px', backgroundPosition: '0 0, 3px 3px' }}
            title={c === 'transparent' ? 'Transparent' : c}
          />
        ))}
      </span>
      <span>Images: {images.length}</span>
      <span>Annotations: {annotations.length}</span>
      <div className="flex-1" />
      {sponsorUrl && (
        <a
          href={sponsorUrl}
          className="text-accent hover:text-accent-hover transition-colors font-medium"
        >
          ♥ Become a sponsor
        </a>
      )}
      {footerLinks.map((link) => (
        <a
          key={link.url}
          href={link.url}
          className="text-gray-500 hover:text-gray-300 transition-colors"
        >
          {link.label}
        </a>
      ))}
      <a href="https://github.com/DL6ER/stift" target="_blank" rel="noopener noreferrer"
        className="text-gray-500 hover:text-gray-300 transition-colors">GitHub</a>
      <span className="text-gray-600">Stift v0.1.0 -- EUPL-1.2</span>
    </div>
  )
}
