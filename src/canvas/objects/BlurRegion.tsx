// Blur/pixelate overlay. Konva has no native blur filter that works
// on a dynamic region of the stage, so we capture the pixels under
// the annotation with stage.toDataURL(), downscale them into a tiny
// offscreen canvas, then draw that back up at the original size with
// imageSmoothing disabled. The result is a classic pixelation mosaic.
//
// The retry loop exists because stage.toDataURL() runs synchronously
// against whatever is currently painted: if the underlying images
// haven't finished decoding yet, we capture a blank white rectangle
// and produce a blank blur. Detect that by sampling the top-left
// corner and, if it's all-white, retry with a backoff up to ten
// attempts. Ten tries with 300ms * n backoff covers roughly 16s of
// image loading, which is generous but finite.

import { useEffect, useRef, useState } from 'react'
import { Image as KonvaImage, Rect } from 'react-konva'
import Konva from 'konva'
import { BlurAnnotation } from '../../types'

interface Props {
  annotation: BlurAnnotation
  stageRef: React.RefObject<Konva.Stage | null>
  commonProps: any
}

export function BlurRegion({ annotation, stageRef, commonProps }: Props) {
  const [blurredImage, setBlurredImage] = useState<HTMLCanvasElement | null>(null)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryCount = useRef(0)

  useEffect(() => {
    retryCount.current = 0

    function captureAndPixelate() {
      const stage = stageRef.current
      if (!stage) return

      const thisNode = stage.findOne(`#${annotation.id}`)
      if (thisNode) thisNode.visible(false)

      let dataURL: string
      try {
        dataURL = stage.toDataURL({
          x: annotation.x,
          y: annotation.y,
          width: annotation.width,
          height: annotation.height,
          pixelRatio: 1,
        })
      } catch {
        if (thisNode) thisNode.visible(true)
        return
      }

      if (thisNode) thisNode.visible(true)

      const img = new window.Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = annotation.width
        canvas.height = annotation.height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, annotation.width, annotation.height)

        // Check if captured area is blank (images not loaded yet)
        const sample = ctx.getImageData(0, 0, Math.min(20, annotation.width), Math.min(20, annotation.height))
        let isBlank = true
        for (let i = 0; i < sample.data.length; i += 4) {
          if (sample.data[i] < 250 || sample.data[i + 1] < 250 || sample.data[i + 2] < 250) {
            isBlank = false
            break
          }
        }

        if (isBlank && retryCount.current < 10) {
          retryCount.current++
          retryTimer.current = setTimeout(captureAndPixelate, 300 * retryCount.current)
          return
        }

        // Pixelate
        const ps = Math.max(2, annotation.pixelSize)
        const w = annotation.width
        const h = annotation.height
        const smallW = Math.max(1, Math.ceil(w / ps))
        const smallH = Math.max(1, Math.ceil(h / ps))

        const tmpCanvas = document.createElement('canvas')
        tmpCanvas.width = smallW
        tmpCanvas.height = smallH
        const tmpCtx = tmpCanvas.getContext('2d')!
        tmpCtx.drawImage(canvas, 0, 0, smallW, smallH)

        ctx.imageSmoothingEnabled = false
        ctx.clearRect(0, 0, w, h)
        ctx.drawImage(tmpCanvas, 0, 0, smallW, smallH, 0, 0, w, h)

        setBlurredImage(canvas)
      }
      img.src = dataURL
    }

    // Initial delay to let images load
    retryTimer.current = setTimeout(captureAndPixelate, 300)

    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current)
    }
  }, [annotation.id, annotation.x, annotation.y, annotation.width, annotation.height, annotation.pixelSize, stageRef])

  if (!blurredImage) {
    return (
      <Rect
        {...commonProps}
        x={annotation.x}
        y={annotation.y}
        width={annotation.width}
        height={annotation.height}
        fill="#333"
        opacity={0.7}
      />
    )
  }

  return (
    <KonvaImage
      {...commonProps}
      x={annotation.x}
      y={annotation.y}
      width={annotation.width}
      height={annotation.height}
      image={blurredImage}
    />
  )
}
