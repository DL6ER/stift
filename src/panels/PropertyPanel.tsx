// Right-side inspector panel. Shows the editable properties for the
// current selection: stroke / fill / width / font / z-order / and
// shape-specific bits. When nothing is selected it falls back to
// showing the *next* shape's defaults (so the user can pre-set a
// colour before drawing). Most controls write straight back into the
// editor store; z-order operations dispatch to projectStore.

import { useEffect, useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUp, ChevronsDown, Pin, PinOff } from 'lucide-react'
import { useEditorStore } from '../stores/editorStore'
import { useProjectStore } from '../stores/projectStore'
import { Annotation, FONT_OPTIONS, STAMP_PRESETS, ToolType, ArrowAnnotation, CounterAnnotation, MagnifierAnnotation } from '../types'

// Read any field from the annotation union without per-type type
// guards. The property panel needs to access shape-specific fields
// (stroke, fill, width, etc.) that only exist on some variants.
// A single cast function is cleaner than 56 inline `as any` casts.
function field<T = any>(ann: Annotation, key: string): T {
  return (ann as Record<string, any>)[key] as T
}

// Write a partial patch to the annotation. The store's updateAnnotation
// accepts Partial<Annotation> but shape-specific fields (stroke, fill,
// etc.) aren't on the base type, so a cast is needed.
type AnnPatch = Record<string, unknown>
import { strokeWidthPatch } from '../canvas/useDrawingHandler'

const COLOR_PRESETS = ['#e74c3c', '#e67e22', '#f39c12', '#2ecc71', '#3498db', '#9b59b6', '#1abc9c', '#34495e', '#ffffff', '#000000']

// Which tool-default controls actually feed into the next-drawn shape
// for a given active tool. Drives the no-selection "Tool defaults"
// section so we never show, say, a Font Size slider while the arrow
// tool is active. Returns null for tools that have no settable
// defaults at all (select, connector); the panel collapses for those
// when nothing is selected and the user hasn't pinned it open.
type ToolDefaults = { stroke: boolean; fill: boolean; strokeWidth: boolean; fontSize: boolean; blurSize: boolean; opacity: boolean }
function defaultsForTool(tool: ToolType): ToolDefaults | null {
  const base: ToolDefaults = { stroke: false, fill: false, strokeWidth: false, fontSize: false, blurSize: false, opacity: true }
  switch (tool) {
    case 'arrow':
    case 'line':
    case 'draw':
      return { ...base, stroke: true, strokeWidth: true }
    case 'rectangle':
    case 'ellipse':
      return { ...base, stroke: true, fill: true, strokeWidth: true }
    case 'text':
      return { ...base, fill: true, fontSize: true }
    case 'textbox':
      return { ...base, stroke: true, fill: true, fontSize: true }
    case 'highlight':
    case 'colorbox':
      return { ...base, fill: true }
    case 'blur':
      return { ...base, blurSize: true }
    case 'counter':
      return { ...base, stroke: true, fontSize: true }
    case 'dimension':
      return { ...base, stroke: true, strokeWidth: true, fontSize: true }
    case 'stamp':
      return { ...base, stroke: true }
    default:
      // select, connector: nothing meaningful to pre-set
      return null
  }
}

export function PropertyPanel() {
  const selectedIds = useEditorStore((s) => s.selectedIds)
  const strokeColor = useEditorStore((s) => s.strokeColor)
  const setStrokeColor = useEditorStore((s) => s.setStrokeColor)
  const fillColor = useEditorStore((s) => s.fillColor)
  const setFillColor = useEditorStore((s) => s.setFillColor)
  const strokeWidth = useEditorStore((s) => s.strokeWidth)
  const setStrokeWidth = useEditorStore((s) => s.setStrokeWidth)
  const fontSize = useEditorStore((s) => s.fontSize)
  const setFontSize = useEditorStore((s) => s.setFontSize)
  const blurPixelSize = useEditorStore((s) => s.blurPixelSize)
  const setBlurPixelSize = useEditorStore((s) => s.setBlurPixelSize)
  const opacity = useEditorStore((s) => s.opacity)
  const setOpacity = useEditorStore((s) => s.setOpacity)
  const activeTool = useEditorStore((s) => s.activeTool)

  const annotations = useProjectStore((s) => s.annotations)
  const images = useProjectStore((s) => s.images)
  const rois = useProjectStore((s) => s.rois)
  const connectors = useProjectStore((s) => s.connectors)
  const updateAnnotation = useProjectStore((s) => s.updateAnnotation)
  const updateImage = useProjectStore((s) => s.updateImage)
  const pushHistory = useProjectStore((s) => s.pushHistory)
  const nextCounter = useProjectStore((s) => s.nextCounter)
  const setNextCounter = useProjectStore((s) => s.setNextCounter)

  const propertyPanelPinned = useEditorStore((s) => s.propertyPanelPinned)
  const togglePropertyPanelPinned = useEditorStore((s) => s.togglePropertyPanelPinned)

  const ann = selectedIds.length === 1 ? annotations.find((a) => a.id === selectedIds[0]) : null
  const img = selectedIds.length === 1 ? images.find((i) => i.id === selectedIds[0]) : null
  const roi = selectedIds.length === 1 ? rois.find((r) => r.id === selectedIds[0]) : null
  const conn = selectedIds.length === 1 ? connectors.find((c) => c.id === selectedIds[0]) : null
  const multiSelect = selectedIds.length > 1

  const updateAnn = (patch: Partial<Annotation>) => { if (ann) { pushHistory(); updateAnnotation(ann.id, patch) } }
  const updateImg = (patch: Record<string, any>) => { if (img) { pushHistory(); updateImage(img.id, patch) } }

  const hasSelection = ann || img || roi || conn || multiSelect
  const toolDefaults = defaultsForTool(activeTool)

  // First-mount intro: render the panel open for a beat, then let the
  // collapse logic kick in so the user sees the panel exists and the
  // collapse animates in front of them. Without this, the panel would
  // be born already collapsed on a fresh load and most users would
  // never realise it could expand. The 700ms delay is long enough to
  // register but short enough not to feel like a stall.
  const [introPlayed, setIntroPlayed] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setIntroPlayed(true), 700)
    return () => clearTimeout(t)
  }, [])

  // Collapse when there's nothing useful to show. Stay open when:
  // something is selected, the panel is pinned, OR a drawing tool
  // with settable defaults is active (so the user can pre-set
  // colors/sizes before drawing).
  const hasToolDefaults = !!toolDefaults
  const collapsed = introPlayed && !hasSelection && !propertyPanelPinned && !hasToolDefaults

  // Delayed-unmount: when collapsing, keep the expanded content
  // mounted for the duration of the width animation so it can slide
  // out of view, then drop it from the DOM entirely. When expanding,
  // mount immediately so the content is visible while the panel
  // grows. This is what the user wants: nothing rendered behind the
  // collapsed strip once the animation has settled.
  const TRANSITION_MS = 200
  const [showExpandedContent, setShowExpandedContent] = useState(true)
  useEffect(() => {
    if (collapsed) {
      const t = setTimeout(() => setShowExpandedContent(false), TRANSITION_MS)
      return () => clearTimeout(t)
    }
    setShowExpandedContent(true)
  }, [collapsed])

  const hasStroke = ann && 'stroke' in ann
  const hasWidth = ann && 'width' in ann && 'height' in ann
  const hasRadius = ann && 'radiusX' in ann
  const isText = ann?.type === 'text'
  const isTextBox = ann?.type === 'textbox'
  const isArrow = ann?.type === 'arrow'
  const isRect = ann?.type === 'rectangle'
  const isDimension = ann?.type === 'dimension'
  const isBlur = ann?.type === 'blur'
  const isStamp = ann?.type === 'stamp'
  const isMagnifier = ann?.type === 'magnifier'

  return (
    <div
      className={`${collapsed ? 'w-8' : 'w-56'} shrink-0 bg-surface-raised border-l border-border overflow-hidden transition-[width] duration-200 ease-out relative`}
    >
      {/* Always-rendered pin button strip. Sits in the top-left so
          it lands inside the visible 32px when collapsed, and in the
          same screen position as the expanded header's pin so the
          button doesn't visually jump between modes. */}
      <div className="absolute top-0 left-0 p-2 z-10">
        <button
          onClick={togglePropertyPanelPinned}
          title={propertyPanelPinned ? 'Unpin (auto-collapse when empty)' : 'Pin panel open'}
          className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
            propertyPanelPinned ? 'text-accent hover:bg-surface-overlay' : 'text-gray-500 hover:bg-surface-overlay hover:text-gray-300'
          }`}
        >
          {propertyPanelPinned ? <PinOff size={13} /> : <Pin size={13} />}
        </button>
      </div>

      {/* Expanded content. Fixed width so the inner layout never
          reflows while the outer animates -- it just slides under
          the clipping window. Unmounted entirely once the collapse
          animation has finished so nothing is left behind the
          collapsed strip. */}
      {showExpandedContent && (
        <div className="w-56 h-full flex flex-col">
          <div className="p-2 border-b border-border flex items-center gap-2 shrink-0 pl-10">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Properties</h3>
          </div>

          <div
            className={`p-3 space-y-3 text-sm overflow-y-auto ${collapsed ? 'pointer-events-none' : ''}`}
            aria-hidden={collapsed}
          >
        {/* Nothing selected, panel pinned open: show only the defaults
            that the active tool will actually consume. If the current
            tool has no settable defaults at all (select, connector),
            tell the user instead of showing a useless empty section. */}
        {!hasSelection && (
          toolDefaults ? (
            <>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">Tool defaults ({activeTool})</p>
              {toolDefaults.stroke && (
                <ColorPicker label="Stroke Color" value={strokeColor} presets={COLOR_PRESETS}
                  onChange={(c) => setStrokeColor(c)} />
              )}
              {toolDefaults.fill && (
                <ColorPicker label="Fill Color" value={fillColor} presets={COLOR_PRESETS}
                  allowTransparent={activeTool === 'rectangle' || activeTool === 'ellipse' || activeTool === 'textbox'}
                  onClear={() => setFillColor('transparent')}
                  onChange={(c) => setFillColor(c)} />
              )}
              {toolDefaults.strokeWidth && (
                <SliderInput label="Stroke Width" value={strokeWidth} min={1} max={20} onChange={setStrokeWidth} />
              )}
              {toolDefaults.fontSize && (
                <SliderInput label="Font Size" value={fontSize} min={8} max={72} onChange={setFontSize} />
              )}
              {toolDefaults.blurSize && (
                <SliderInput label="Blur Size" value={blurPixelSize} min={2} max={40} onChange={setBlurPixelSize} />
              )}
              {toolDefaults.opacity && (
                <SliderInput label="Opacity" value={Math.round(opacity * 100)} min={0} max={100} suffix="%" onChange={(v) => setOpacity(v / 100)} />
              )}
              {activeTool === 'counter' && (
                <>
                  <div>
                    <label className="block text-xs text-gray-400 mb-0.5">Next number</label>
                    <input
                      type="number" min={1} value={nextCounter}
                      onChange={(e) => setNextCounter(parseInt(e.target.value) || 1)}
                      className="w-full bg-surface-overlay border border-border rounded px-2 py-1 text-xs text-gray-300 outline-none"
                    />
                  </div>
                  <button onClick={() => setNextCounter(1)}
                    className="w-full text-xs bg-surface-overlay border border-border rounded px-2 py-1 text-gray-300 hover:bg-surface-overlay/80">
                    Reset to 1
                  </button>
                </>
              )}
            </>
          ) : (
            <p className="text-[11px] text-gray-500 leading-relaxed">
              The {activeTool} tool has no defaults to set here. Pick a drawing tool, or click an object on the canvas to edit it.
            </p>
          )
        )}

        {/* Multi-select -- minimal shared controls */}
        {multiSelect && (
          <>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">{selectedIds.length} items selected</p>
            <SliderInput label="Opacity" value={Math.round(opacity * 100)} min={0} max={100} suffix="%"
              onChange={(v) => {
                const o = v / 100
                setOpacity(o)
                const store = useProjectStore.getState()
                pushHistory()
                for (const id of selectedIds) {
                  const a = store.annotations.find((x) => x.id === id)
                  if (a) store.updateAnnotation(id, { opacity: o })
                  const i = store.images.find((x) => x.id === id)
                  if (i) store.updateImage(id, { opacity: o })
                }
              }} />
          </>
        )}

        {/* -- Single annotation selected -- */}
        {ann && (
          <>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">{ann.type}</p>

            {/* Counter number */}
            {ann.type === 'counter' && (
              <div>
                <label className="block text-xs text-gray-400 mb-0.5">Number</label>
                <input
                  type="number" min={1} value={field(ann, 'number')}
                  onChange={(e) => updateAnn({ number: Math.max(1, parseInt(e.target.value) || 1) } as AnnPatch)}
                  className="w-full bg-surface-overlay border border-border rounded px-2 py-1 text-xs text-gray-300 outline-none"
                />
              </div>
            )}

            {/* Stroke color (arrows, rects, ellipses, lines, textbox border) */}
            {hasStroke && (
              <ColorPicker label="Stroke Color" value={field(ann, 'stroke')} presets={COLOR_PRESETS}
                onChange={(c) => { setStrokeColor(c); updateAnn({ stroke: c } as AnnPatch) }} />
            )}

            {/* Fill / text color */}
            {(isText || isTextBox) && (
              <ColorPicker label="Text Color" value={field(ann, 'fill')} presets={COLOR_PRESETS}
                onChange={(c) => updateAnn({ fill: c } as AnnPatch)} />
            )}

            {/* Shape fill color (counter, rectangle, ellipse, colorbox, highlight) */}
            {(ann.type === 'counter' || ann.type === 'rectangle' || ann.type === 'ellipse' || ann.type === 'colorbox' || ann.type === 'highlight') && (
              <ColorPicker
                label={ann.type === 'counter' ? 'Color' : 'Fill Color'}
                value={field(ann, 'fill')}
                presets={COLOR_PRESETS}
                allowTransparent={ann.type === 'rectangle' || ann.type === 'ellipse'}
                onClear={() => updateAnn({ fill: undefined } as AnnPatch)}
                onChange={(c) => updateAnn({ fill: c } as AnnPatch)}
              />
            )}

            {/* Background color for textboxes */}
            {isTextBox && (
              <ColorPicker label="Background" value={field(ann, 'backgroundColor') || '#fff'} presets={COLOR_PRESETS}
                allowTransparent onClear={() => updateAnn({ backgroundColor: 'transparent' } as AnnPatch)}
                onChange={(c) => updateAnn({ backgroundColor: c } as AnnPatch)} />
            )}

            {/* Stroke width */}
            {hasStroke && (
              <SliderInput label="Stroke Width" value={field(ann, 'strokeWidth')} min={1} max={20}
                onChange={(v) => { setStrokeWidth(v); updateAnn(strokeWidthPatch(ann.type, v) as AnnPatch) }} />
            )}

            {/* Counter size */}
            {ann.type === 'counter' && (
              <SliderInput label="Size" value={field(ann, 'radius')} min={8} max={72}
                onChange={(v) => { setFontSize(v); updateAnn({ radius: v, fontSize: v } as AnnPatch) }} />
            )}

            {/* Font size + family */}
            {(isText || isTextBox || isDimension) && (
              <>
                <SliderInput label="Font Size" value={field(ann, 'fontSize')} min={8} max={72}
                  onChange={(v) => { setFontSize(v); updateAnn({ fontSize: v } as AnnPatch) }} />
                <div>
                  <label className="block text-xs text-gray-400 mb-0.5">Font</label>
                  <select value={field(ann, 'fontFamily') || 'sans-serif'}
                    onChange={(e) => updateAnn({ fontFamily: e.target.value } as AnnPatch)}
                    className="w-full bg-surface-overlay border border-border rounded px-2 py-1 text-xs text-gray-300 outline-none">
                    {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
              </>
            )}

            {/* Padding for textboxes */}
            {isTextBox && (
              <SliderInput label="Padding" value={field(ann, 'padding') ?? Math.round(field(ann, 'fontSize') * 0.6)} min={2} max={30}
                onChange={(v) => updateAnn({ padding: v } as AnnPatch)} />
            )}

            {/* Blur size */}
            {isBlur && (
              <SliderInput label="Blur Size" value={field(ann, 'pixelSize')} min={2} max={40}
                onChange={(v) => { setBlurPixelSize(v); updateAnn({ pixelSize: v } as AnnPatch) }} />
            )}

            {/* Magnifier controls */}
            {isMagnifier && (
              <>
                <ColorPicker label="Border Color" value={field(ann, 'borderColor')} presets={COLOR_PRESETS}
                  onChange={(c) => updateAnn({ borderColor: c } as AnnPatch)} />
                <SliderInput label="Border" value={field(ann, 'borderWidth') ?? 2} min={0} max={8}
                  onChange={(v) => updateAnn({ borderWidth: v } as AnnPatch)} />
                <div>
                  <label className="block text-xs text-gray-400 mb-0.5">Line Style</label>
                  <select value={field(ann, 'dash') || 'dashed'}
                    onChange={(e) => updateAnn({ dash: e.target.value } as AnnPatch)}
                    className="w-full bg-surface-overlay border border-border rounded px-2 py-1 text-xs text-gray-300 outline-none">
                    <option value="solid">Solid</option>
                    <option value="dashed">Dashed</option>
                    <option value="dotted">Dotted</option>
                  </select>
                </div>
                <button
                  onClick={() => (window as any).__refreshMagnifier?.()}
                  className="w-full text-xs bg-surface-overlay border border-border rounded px-2 py-1 text-gray-300 hover:bg-surface-overlay/80">
                  Refresh capture
                </button>
              </>
            )}

            {/* Opacity */}
            <SliderInput label="Opacity" value={Math.round((ann.opacity ?? 1) * 100)} min={0} max={100} suffix="%"
              onChange={(v) => updateAnn({ opacity: v / 100 })} />

            {/* Dash style */}
            {hasStroke && !isTextBox && (
              <div>
                <label className="block text-xs text-gray-400 mb-0.5">Line Style</label>
                <select value={field(ann, 'dash') || 'solid'}
                  onChange={(e) => updateAnn({ dash: e.target.value } as AnnPatch)}
                  className="w-full bg-surface-overlay border border-border rounded px-2 py-1 text-xs text-gray-300 outline-none">
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                  <option value="dotted">Dotted</option>
                </select>
              </div>
            )}

            {/* Arrow options */}
            {isArrow && (
              <>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={field(ann, 'doubleHead') ?? false}
                    onChange={(e) => updateAnn({ doubleHead: e.target.checked } as AnnPatch)} className="accent-accent" />
                  <span className="text-xs text-gray-400">Double-head</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={field(ann, 'curved') ?? false}
                    onChange={(e) => {
                      const pts = field(ann, 'points') as number[]
                      const cx = (pts[0] + pts[2]) / 2
                      const cy = (pts[1] + pts[3]) / 2 - 50
                      updateAnn({ curved: e.target.checked, controlX: cx, controlY: cy } as AnnPatch)
                    }} className="accent-accent" />
                  <span className="text-xs text-gray-400">Curved</span>
                </label>
              </>
            )}

            {/* Corner radius */}
            {isRect && (
              <SliderInput label="Corner Radius" value={field(ann, 'cornerRadius') ?? 6} min={0} max={50}
                onChange={(v) => updateAnn({ cornerRadius: v } as AnnPatch)} />
            )}

            {/* Stamp text */}
            {isStamp && (
              <div>
                <label className="block text-xs text-gray-400 mb-0.5">Stamp Text</label>
                <select value={STAMP_PRESETS.includes(field(ann, 'text')) ? field(ann, 'text') : '...'}
                  onChange={(e) => {
                    if (e.target.value === '...') {
                      const custom = prompt('Enter custom stamp text:', field(ann, 'text'))
                      if (custom) updateAnn({ text: custom } as AnnPatch)
                    } else {
                      updateAnn({ text: e.target.value } as AnnPatch)
                    }
                  }}
                  className="w-full bg-surface-overlay border border-border rounded px-2 py-1 text-xs text-gray-300 outline-none">
                  {STAMP_PRESETS.map((s) => <option key={s} value={s}>{s}</option>)}
                  <option value="...">Custom...</option>
                </select>
                {!STAMP_PRESETS.includes(field(ann, 'text')) && (
                  <input type="text" value={field(ann, 'text')}
                    onChange={(e) => updateAnn({ text: e.target.value } as AnnPatch)}
                    className="w-full mt-1 bg-surface-overlay border border-border rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-accent" />
                )}
              </div>
            )}

            {/* Dimension label */}
            {isDimension && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">Label</label>
                <input type="text" value={field(ann, 'label') || ''}
                  onChange={(e) => {
                    const label = e.target.value
                    updateAnn({ label } as AnnPatch)
                    const match = label.match(/^([\d.]+)\s*(.+)$/)
                    if (match) {
                      const value = parseFloat(match[1])
                      if (value > 0) {
                        const pts = field(ann, 'points') as number[]
                        const pxLen = Math.sqrt((pts[2] - pts[0]) ** 2 + (pts[3] - pts[1]) ** 2)
                        updateAnn({ pixelsPerUnit: pxLen / value, unit: match[2].trim() } as AnnPatch)
                      }
                    }
                  }}
                  placeholder="e.g. 10 m"
                  className="w-full bg-surface-overlay border border-border rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-accent" />
                <p className="text-[10px] text-gray-500 mt-1">Enter value + unit to calibrate future measurements</p>
              </div>
            )}

            {/* Position / size */}
            <div className="pt-2 border-t border-border space-y-1.5">
              <div className="grid grid-cols-2 gap-1.5">
                <NumInput label="X" value={Math.round(ann.x)} onChange={(v) => updateAnn({ x: v })} />
                <NumInput label="Y" value={Math.round(ann.y)} onChange={(v) => updateAnn({ y: v })} />
              </div>
              {hasWidth && !isTextBox && (
                <div className="grid grid-cols-2 gap-1.5">
                  <NumInput label="W" value={Math.round(field(ann, 'width'))} onChange={(v) => updateAnn({ width: v } as AnnPatch)} />
                  <NumInput label="H" value={Math.round(field(ann, 'height'))} onChange={(v) => updateAnn({ height: v } as AnnPatch)} />
                </div>
              )}
              {hasRadius && (
                <div className="grid grid-cols-2 gap-1.5">
                  <NumInput label="RX" value={Math.round(field(ann, 'radiusX'))} onChange={(v) => updateAnn({ radiusX: v } as AnnPatch)} />
                  <NumInput label="RY" value={Math.round(field(ann, 'radiusY'))} onChange={(v) => updateAnn({ radiusY: v } as AnnPatch)} />
                </div>
              )}
              <NumInput label="Rotation" value={Math.round(ann.rotation || 0)} onChange={(v) => updateAnn({ rotation: v })} suffix="°" />

              {/* Layer ordering */}
              <div className="flex items-center gap-1 pt-1">
                <span className="text-[10px] text-gray-500 mr-1">Layer</span>
                <LayerBtn icon={ChevronsDown} title="Send to Back" onClick={() => { pushHistory(); useProjectStore.getState().moveAnnotationToBack(ann.id) }} />
                <LayerBtn icon={ChevronDown} title="Send Backward" onClick={() => { pushHistory(); useProjectStore.getState().moveAnnotationBackward(ann.id) }} />
                <LayerBtn icon={ChevronUp} title="Bring Forward" onClick={() => { pushHistory(); useProjectStore.getState().moveAnnotationForward(ann.id) }} />
                <LayerBtn icon={ChevronsUp} title="Bring to Front" onClick={() => { pushHistory(); useProjectStore.getState().moveAnnotationToFront(ann.id) }} />
              </div>
            </div>

            {/* Lock position */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={ann.locked ?? false} onChange={(e) => { pushHistory(); updateAnn({ locked: e.target.checked }) }} className="accent-accent" />
              <span className="text-xs text-gray-400">Lock position</span>
            </label>
          </>
        )}

        {/* -- ROI selected -- */}
        {roi && (
          <div className="space-y-2">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">ROI #{roi.number}</p>
            <div className="grid grid-cols-2 gap-1.5">
              <NumInput label="X" value={Math.round(roi.x)} onChange={(v) => { pushHistory(); useProjectStore.getState().updateROI(roi.id, { x: v }) }} />
              <NumInput label="Y" value={Math.round(roi.y)} onChange={(v) => { pushHistory(); useProjectStore.getState().updateROI(roi.id, { y: v }) }} />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <NumInput label="W" value={Math.round(roi.width)} onChange={(v) => { pushHistory(); useProjectStore.getState().updateROI(roi.id, { width: v }) }} />
              <NumInput label="H" value={Math.round(roi.height)} onChange={(v) => { pushHistory(); useProjectStore.getState().updateROI(roi.id, { height: v }) }} />
            </div>
          </div>
        )}

        {/* -- Connector selected -- */}
        {conn && (
          <div className="space-y-2">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Connector</p>
            <ColorPicker label="Color" value={conn.color} presets={COLOR_PRESETS.slice(0, 8)}
              onChange={(c) => {
                pushHistory()
                useProjectStore.getState().updateConnector(conn.id, { color: c })
                const r = rois.find((x) => x.id === conn.fromRoiId)
                if (r) useProjectStore.getState().updateROI(r.id, { color: c })
              }} />
            <SliderInput label="Line Width" value={conn.strokeWidth || 2} min={1} max={8}
              onChange={(v) => { pushHistory(); useProjectStore.getState().updateConnector(conn.id, { strokeWidth: v }) }} />
            <div>
              <label className="block text-xs text-gray-400 mb-1">Style</label>
              <select value={conn.style}
                onChange={(e) => { pushHistory(); useProjectStore.getState().updateConnector(conn.id, { style: e.target.value as any }) }}
                className="w-full bg-surface-overlay border border-border rounded px-2 py-1 text-xs text-gray-300 outline-none">
                <option value="straight">Straight</option>
                <option value="orthogonal">Orthogonal</option>
                <option value="curved">Curved</option>
              </select>
            </div>
          </div>
        )}

        {/* -- Image selected -- */}
        {img && (
          <div className="space-y-2">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider truncate">Image: {img.name}</p>
            <div className="grid grid-cols-2 gap-1.5">
              <NumInput label="X" value={Math.round(img.x)} onChange={(v) => updateImg({ x: v })} />
              <NumInput label="Y" value={Math.round(img.y)} onChange={(v) => updateImg({ y: v })} />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <NumInput label="W" value={Math.round(img.width)} onChange={(v) => updateImg({ width: v })} />
              <NumInput label="H" value={Math.round(img.height)} onChange={(v) => updateImg({ height: v })} />
            </div>
            <NumInput label="Rotation" value={Math.round(img.rotation || 0)} onChange={(v) => updateImg({ rotation: v })} suffix="°" />
            <SliderInput label="Opacity" value={Math.round((img.opacity ?? 1) * 100)} min={0} max={100} suffix="%"
              onChange={(v) => updateImg({ opacity: v / 100 })} />
            <SliderInput label="Brightness" value={Math.round((img.brightness ?? 0) * 100)} min={-100} max={100} suffix="%"
              onChange={(v) => updateImg({ brightness: v / 100 })} />
            <SliderInput label="Contrast" value={img.contrast ?? 0} min={-100} max={100}
              onChange={(v) => updateImg({ contrast: v })} />
            <div className="text-[10px] text-gray-500">Original: {img.naturalWidth} x {img.naturalHeight}</div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={img.locked ?? false} onChange={(e) => updateImg({ locked: e.target.checked })} className="accent-accent" />
              <span className="text-xs text-gray-400">Lock position</span>
            </label>
            <div className="flex gap-2">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={img.flipX ?? false} onChange={(e) => updateImg({ flipX: e.target.checked })} className="accent-accent" />
                <span className="text-xs text-gray-400">Flip H</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={img.flipY ?? false} onChange={(e) => updateImg({ flipY: e.target.checked })} className="accent-accent" />
                <span className="text-xs text-gray-400">Flip V</span>
              </label>
            </div>

            {/* Crop */}
            <div className="pt-2 border-t border-border space-y-1.5">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">Crop (source px)</p>
              <div className="grid grid-cols-2 gap-1.5">
                <NumInput label="CX" value={img.cropX ?? 0} onChange={(v) => {
                  const fresh = useProjectStore.getState().images.find((i) => i.id === img.id)!
                  const cx = Math.max(0, Math.min(v, fresh.naturalWidth - 10))
                  const oldCW = fresh.cropWidth || fresh.naturalWidth
                  const newCW = Math.max(10, Math.min(fresh.naturalWidth - cx, oldCW))
                  const pps = fresh.width / (fresh.cropWidth || fresh.naturalWidth)
                  updateImg({ cropX: cx, cropWidth: newCW, width: Math.round(newCW * pps) })
                }} />
                <NumInput label="CY" value={img.cropY ?? 0} onChange={(v) => {
                  const fresh = useProjectStore.getState().images.find((i) => i.id === img.id)!
                  const cy = Math.max(0, Math.min(v, fresh.naturalHeight - 10))
                  const oldCH = fresh.cropHeight || fresh.naturalHeight
                  const newCH = Math.max(10, Math.min(fresh.naturalHeight - cy, oldCH))
                  const pps = fresh.height / (fresh.cropHeight || fresh.naturalHeight)
                  updateImg({ cropY: cy, cropHeight: newCH, height: Math.round(newCH * pps) })
                }} />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <NumInput label="CW" value={img.cropWidth ?? img.naturalWidth} onChange={(v) => {
                  const fresh = useProjectStore.getState().images.find((i) => i.id === img.id)!
                  const cx = fresh.cropX ?? 0
                  const newCW = Math.max(10, Math.min(v, fresh.naturalWidth - cx))
                  const pps = fresh.width / (fresh.cropWidth || fresh.naturalWidth)
                  updateImg({ cropWidth: newCW, width: Math.round(newCW * pps) })
                }} />
                <NumInput label="CH" value={img.cropHeight ?? img.naturalHeight} onChange={(v) => {
                  const fresh = useProjectStore.getState().images.find((i) => i.id === img.id)!
                  const cy = fresh.cropY ?? 0
                  const newCH = Math.max(10, Math.min(v, fresh.naturalHeight - cy))
                  const pps = fresh.height / (fresh.cropHeight || fresh.naturalHeight)
                  updateImg({ cropHeight: newCH, height: Math.round(newCH * pps) })
                }} />
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => useEditorStore.getState().setCroppingImageId(img.id)}
                  className="flex-1 px-2 py-1 text-[10px] bg-amber-700 hover:bg-amber-600 text-white rounded transition-colors">Crop Mode</button>
                {img.cropWidth && (
                  <button onClick={() => { pushHistory(); updateImg({ cropX: undefined, cropY: undefined, cropWidth: undefined, cropHeight: undefined }) }}
                    className="flex-1 px-2 py-1 text-[10px] bg-surface-overlay hover:bg-surface-raised text-gray-300 rounded border border-border transition-colors">Reset</button>
                )}
              </div>
            </div>
          </div>
        )}
          </div>
        </div>
      )}
    </div>
  )
}

function ColorPicker({ label, value, presets, onChange, allowTransparent, onClear }: {
  label: string
  value: string | undefined
  presets: string[]
  onChange: (c: string) => void
  allowTransparent?: boolean
  onClear?: () => void
}) {
  const isNoFill = allowTransparent && (!value || value === 'transparent')
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <div className="flex flex-wrap gap-1 mb-1.5">
        {allowTransparent && (
          <button
            title="No fill"
            onClick={onClear}
            className="rounded-full hover:scale-110 transition-transform"
            style={{
              width: 18, height: 18,
              background: 'linear-gradient(to bottom right, #fff 0%, #fff calc(50% - 1px), #e74c3c calc(50% - 1px), #e74c3c calc(50% + 1px), #fff calc(50% + 1px), #fff 100%)',
              outline: isNoFill ? '2px solid white' : '1px solid #4b5563',
              outlineOffset: isNoFill ? '1px' : '0',
            }}
          />
        )}
        {presets.map((c) => (
          <button key={c} className="rounded-full border border-gray-600 hover:scale-110 transition-transform"
            style={{ backgroundColor: c, width: 18, height: 18 }} onClick={() => onChange(c)} />
        ))}
      </div>
      <input type="color" value={isNoFill ? '#ffffff' : (value || '#ffffff')} onChange={(e) => onChange(e.target.value)}
        className="w-full h-7 rounded cursor-pointer bg-transparent" />
    </div>
  )
}

function SliderInput({ label, value, min, max, suffix, step, onChange }: { label: string; value: number; min: number; max: number; suffix?: string; step?: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-0.5">{label}: {value}{suffix || ''}</label>
      <input type="range" min={min} max={max} step={step || 1} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-accent" />
    </div>
  )
}

function LayerBtn({ icon: Icon, title, onClick }: { icon: React.ElementType; title: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={title} className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:bg-surface-overlay hover:text-gray-200 transition-colors">
      <Icon size={14} />
    </button>
  )
}

function NumInput({ label, value, onChange, suffix, step }: { label: string; value: number; onChange: (v: number) => void; suffix?: string; step?: number }) {
  const s = step ?? 1
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-gray-500 w-5 shrink-0">{label}</span>
      <input type="number" value={value} step={s}
        onChange={(e) => onChange(Number(e.target.value))}
        onWheel={(e) => { e.preventDefault(); onChange(Math.round((value + (e.deltaY < 0 ? s : -s)) * 100) / 100) }}
        className="w-full bg-surface-overlay border border-border rounded px-1.5 py-0.5 text-xs text-gray-300 outline-none focus:border-accent" />
      {suffix && <span className="text-[10px] text-gray-500">{suffix}</span>}
    </div>
  )
}
