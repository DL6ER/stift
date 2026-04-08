// Drag-and-drop image import. Listens on the window so the user can
// drop a file anywhere over the app, not just inside the canvas
// rect. Files go through loadImageFromFile so they get the same
// downscale + dataURL treatment as paste and the file picker.

import { useEffect } from 'react'
import { useProjectStore } from '../stores/projectStore'
import { loadImageFromFile } from '../lib/clipboard'

export function useImageDrop(containerRef: React.RefObject<HTMLDivElement | null>) {
  const addImage = useProjectStore((s) => s.addImage)
  const pushHistory = useProjectStore((s) => s.pushHistory)
  const canvasWidth = useProjectStore((s) => s.canvasWidth)
  const canvasHeight = useProjectStore((s) => s.canvasHeight)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
      e.dataTransfer!.dropEffect = 'copy'
    }

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault()
      const files = Array.from(e.dataTransfer?.files ?? [])
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue
        const imgData = await loadImageFromFile(file)
        pushHistory()
        let w = imgData.width
        let h = imgData.height
        const maxW = canvasWidth * 0.8
        const maxH = canvasHeight * 0.8
        if (w > maxW || h > maxH) {
          const scale = Math.min(maxW / w, maxH / h)
          w = Math.round(w * scale)
          h = Math.round(h * scale)
        }
        addImage({
          data: imgData.data,
          name: imgData.name,
          x: Math.round((canvasWidth - w) / 2),
          y: Math.round((canvasHeight - h) / 2),
          width: w,
          height: h,
          naturalWidth: imgData.width,
          naturalHeight: imgData.height,
          role: 'standalone',
        })
      }
    }

    el.addEventListener('dragover', handleDragOver)
    el.addEventListener('drop', handleDrop)
    return () => {
      el.removeEventListener('dragover', handleDragOver)
      el.removeEventListener('drop', handleDrop)
    }
  }, [containerRef, addImage, pushHistory, canvasWidth, canvasHeight])
}
