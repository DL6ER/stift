// Paste-image-from-clipboard hook and file-to-image loader. The paste
// handler is installed on window (not on a Konva node) because a Stage
// doesn't catch the browser's native paste event, and users expect
// Ctrl+V after a screenshot to drop the image straight onto the canvas.

import { useEffect } from 'react'
import { useProjectStore } from '../stores/projectStore'

// Allowlist of bitmap MIME types we accept from clipboard paste and file
// drop. SVG is deliberately excluded -- it would render safely inside an
// <img> element today, but keeping the input surface to known bitmap
// formats removes a whole class of defense-in-depth questions (foreignObject,
// script tags, external href references) for free.
export const ACCEPTED_IMAGE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

export function isAcceptedImageType(type: string): boolean {
  return ACCEPTED_IMAGE_MIME.has(type)
}

export function useClipboardPaste() {
  const addImage = useProjectStore((s) => s.addImage)
  const pushHistory = useProjectStore((s) => s.pushHistory)
  const canvasWidth = useProjectStore((s) => s.canvasWidth)
  const canvasHeight = useProjectStore((s) => s.canvasHeight)

  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return

      for (const item of Array.from(items)) {
        if (isAcceptedImageType(item.type)) {
          e.preventDefault()
          const blob = item.getAsFile()
          if (!blob) continue

          const reader = new FileReader()
          reader.onload = () => {
            const data = reader.result as string
            const img = new Image()
            img.onload = () => {
              pushHistory()
              // Center the image on canvas, scale down if too large
              let w = img.width
              let h = img.height
              const maxW = canvasWidth * 0.8
              const maxH = canvasHeight * 0.8
              if (w > maxW || h > maxH) {
                const scale = Math.min(maxW / w, maxH / h)
                w = Math.round(w * scale)
                h = Math.round(h * scale)
              }
              const x = Math.round((canvasWidth - w) / 2)
              const y = Math.round((canvasHeight - h) / 2)
              addImage({
                data,
                name: `Pasted image`,
                x, y, width: w, height: h,
                naturalWidth: img.width,
                naturalHeight: img.height,
                role: 'standalone',
              })
            }
            img.src = data
          }
          reader.readAsDataURL(blob)
          break
        }
      }
    }

    window.addEventListener('paste', handler)
    return () => window.removeEventListener('paste', handler)
  }, [addImage, pushHistory, canvasWidth, canvasHeight])
}

export function loadImageFromFile(file: File): Promise<{ data: string; width: number; height: number; name: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const data = reader.result as string
      const img = new Image()
      img.onload = () => resolve({ data, width: img.width, height: img.height, name: file.name })
      img.onerror = reject
      img.src = data
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
