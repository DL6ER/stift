// The shared type vocabulary for the whole annotation pipeline.
// Annotation is a discriminated union -- each shape carries its own
// `type` literal so the renderer, the property panel, the drawing
// handler, and the persistence layer can all narrow on it without
// any type assertions. When adding a new tool, the order is roughly:
// add the ToolType literal, add the *Annotation interface, add the
// case to the Annotation union, then teach useDrawingHandler,
// AnnotationRenderer, and PropertyPanel how to render it.

export type ToolType =
  | 'select'
  | 'arrow'
  | 'text'
  | 'textbox'
  | 'highlight'
  | 'blur'
  | 'rectangle'
  | 'ellipse'
  | 'line'
  | 'draw'
  | 'colorbox'
  | 'counter'
  | 'dimension'
  | 'stamp'
  | 'connector'
  | 'eyedropper'
  | 'magnifier'

export interface Point {
  x: number
  y: number
}

export interface AnnotationBase {
  id: string
  type: string
  x: number
  y: number
  rotation?: number
  opacity?: number
  locked?: boolean
  visible?: boolean
  groupId?: string
}

export type DashStyle = 'solid' | 'dashed' | 'dotted'

export interface ArrowAnnotation extends AnnotationBase {
  type: 'arrow'
  points: number[] // [x1, y1, x2, y2] relative to x,y
  stroke: string
  strokeWidth: number
  headSize: number
  doubleHead?: boolean
  dash?: DashStyle
  curved?: boolean
  controlX?: number // bezier control point (relative to annotation origin)
  controlY?: number
}

export interface TextAnnotation extends AnnotationBase {
  type: 'text'
  text: string
  fontSize: number
  fontFamily: string
  fill: string
  backgroundColor?: string
  padding?: number
  bold?: boolean
  italic?: boolean
}

export interface HighlightAnnotation extends AnnotationBase {
  type: 'highlight'
  width: number
  height: number
  fill: string
  opacity: number
}

export interface BlurAnnotation extends AnnotationBase {
  type: 'blur'
  width: number
  height: number
  pixelSize: number
}

export interface RectangleAnnotation extends AnnotationBase {
  type: 'rectangle'
  width: number
  height: number
  stroke: string
  strokeWidth: number
  fill?: string
  cornerRadius?: number
  dash?: DashStyle
}

export interface EllipseAnnotation extends AnnotationBase {
  type: 'ellipse'
  radiusX: number
  radiusY: number
  stroke: string
  strokeWidth: number
  fill?: string
}

export interface LineAnnotation extends AnnotationBase {
  type: 'line'
  points: number[]
  stroke: string
  strokeWidth: number
  dash?: DashStyle
}

export interface DrawAnnotation extends AnnotationBase {
  type: 'draw'
  points: number[]
  stroke: string
  strokeWidth: number
}

export interface ColorBoxAnnotation extends AnnotationBase {
  type: 'colorbox'
  width: number
  height: number
  fill: string
}

export interface CounterAnnotation extends AnnotationBase {
  type: 'counter'
  number: number
  fill: string
  textColor: string
  radius: number
  fontSize: number
  tailX?: number
  tailY?: number
}

export interface TextBoxAnnotation extends AnnotationBase {
  type: 'textbox'
  width: number
  height: number
  text: string
  fontSize: number
  fontFamily: string
  fill: string
  backgroundColor: string
  borderColor: string
  borderWidth: number
  borderRadius: number
  padding: number
  bold?: boolean
  italic?: boolean
  textAlign?: 'left' | 'center' | 'right'
}

export interface DimensionAnnotation extends AnnotationBase {
  type: 'dimension'
  points: number[] // [x1, y1, x2, y2]
  stroke: string
  strokeWidth: number
  fontSize: number
  label: string        // user-editable label (e.g., "10 m", or auto-calculated "234 px")
  unit: string         // calibrated unit (e.g., "m", "cm", "px")
  pixelsPerUnit: number // calibration: how many canvas pixels per unit
  capSize: number
}

export interface StampAnnotation extends AnnotationBase {
  type: 'stamp'
  text: string
  fontSize: number
  fill: string
  borderColor: string
}

export const STAMP_PRESETS = ['DRAFT', 'APPROVED', 'REJECTED', 'CONFIDENTIAL', 'REVIEW', 'FINAL']

export interface MagnifierAnnotation extends AnnotationBase {
  type: 'magnifier'
  // Source region on the canvas to zoom into
  sourceX: number
  sourceY: number
  sourceWidth: number
  sourceHeight: number
  // Display size (the enlarged view)
  width: number
  height: number
  zoom: number // e.g. 2 = 2x magnification
  borderColor: string
  borderWidth: number
  dash?: DashStyle
}

export type Annotation =
  | ArrowAnnotation
  | TextAnnotation
  | TextBoxAnnotation
  | HighlightAnnotation
  | BlurAnnotation
  | RectangleAnnotation
  | EllipseAnnotation
  | LineAnnotation
  | DrawAnnotation
  | ColorBoxAnnotation
  | CounterAnnotation
  | DimensionAnnotation
  | StampAnnotation
  | MagnifierAnnotation

export interface ImageItem {
  id: string
  data: string // base64 data URL
  name: string
  x: number
  y: number
  width: number
  height: number
  naturalWidth: number
  naturalHeight: number
  rotation?: number
  opacity?: number
  locked?: boolean
  flipX?: boolean
  flipY?: boolean
  // Crop: defines which portion of the original image to show (in natural/source pixels)
  cropX?: number
  cropY?: number
  cropWidth?: number
  cropHeight?: number
  role: 'standalone' | 'overview' | 'detail' | 'alternative'
  linkedRoiId?: string
  alternativeOf?: string
  label?: string
  brightness?: number
  contrast?: number
  visible?: boolean
}

export interface ROI {
  id: string
  imageId: string
  x: number
  y: number
  width: number
  height: number
  number: number
  color: string
}

export interface Connector {
  id: string
  fromRoiId: string
  toImageId: string
  color: string
  strokeWidth: number
  style: 'orthogonal' | 'straight' | 'curved'
}

export interface Project {
  version: number
  name: string
  canvasWidth: number
  canvasHeight: number
  images: ImageItem[]
  annotations: Annotation[]
  rois: ROI[]
  connectors: Connector[]
}

export interface HistoryEntry {
  annotations: Annotation[]
  images: ImageItem[]
  rois: ROI[]
  connectors: Connector[]
}

export const ROI_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
  '#9b59b6', '#1abc9c', '#e67e22', '#34495e',
  '#e84393', '#00b894', '#fdcb6e', '#6c5ce7',
]

export const DEFAULT_STROKE_COLOR = '#e74c3c'
export const DEFAULT_FILL_COLOR = '#ffffff'
export const DEFAULT_STROKE_WIDTH = 3
export const DEFAULT_ARROW_HEAD_SIZE = 10
export const DEFAULT_FONT_SIZE = 18
export const DEFAULT_FONT_FAMILY = 'sans-serif'
export const DEFAULT_BLUR_PIXEL_SIZE = 10
export const DEFAULT_COUNTER_RADIUS = 18
export const DEFAULT_CORNER_RADIUS = 6
export const DEFAULT_HIGHLIGHT_COLOR = '#ffff00'

export const FONT_OPTIONS = [
  { label: 'Sans-serif', value: 'sans-serif' },
  { label: 'Serif', value: 'serif' },
  { label: 'Monospace', value: 'monospace' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
]
