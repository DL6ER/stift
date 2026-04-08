import { Annotation, ImageItem, ROI, Connector } from '../types'

export interface ProjectState {
  projectName: string
  canvasWidth: number
  canvasHeight: number
  images: ImageItem[]
  annotations: Annotation[]
  rois: ROI[]
  connectors: Connector[]
}
