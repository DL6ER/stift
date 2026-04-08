/**
 * Image compression for server uploads using WebP.
 *
 * Design decisions:
 * - WebP is used exclusively: ~30% smaller than JPEG, supports transparency,
 *   supported in all modern browsers (Chrome 17+, Firefox 65+, Safari 14+, Edge 18+)
 * - All compression happens CLIENT-SIDE before E2E encryption
 * - The server receives only encrypted blobs -- it cannot resize or re-compress later
 * - Therefore, getting the compression right on first upload is critical
 *
 * Size estimates (base64 data URL, WebP quality 0.82):
 *
 * | Source resolution | Raw pixels  | WebP compressed | Base64 overhead | Final   |
 * |-------------------|-------------|-----------------|-----------------|---------|
 * | 1920x1080         | 8.3 MP      | ~150-250 KB     | +33%            | ~200-330 KB |
 * | 3840x2160 (4K)    | 8.3 MP*     | ~150-250 KB     | +33%            | ~200-330 KB |
 * | 4096x4096         | 4.2 MP*     | ~200-350 KB     | +33%            | ~270-470 KB |
 * | 8000x6000 (48MP)  | 4.2 MP*     | ~200-350 KB     | +33%            | ~270-470 KB |
 *
 * * = after resize to max 2048px
 *
 * With max 2048px and WebP 82%, a single image rarely exceeds 500 KB.
 * A project with 10 images: ~3-5 MB. With encryption overhead: ~4-7 MB.
 *
 * Maximum project size: 10 MB (after compression, before encryption).
 * This allows ~15-25 compressed images per project.
 */

const MAX_DIMENSION = 2048
const WEBP_QUALITY = 0.82
const MAX_PROJECT_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB per project (before encryption)
const MAX_SINGLE_IMAGE_BYTES = 2 * 1024 * 1024  // 2 MB per image (after compression)

export const LIMITS = {
  MAX_DIMENSION,
  MAX_PROJECT_SIZE_MB: MAX_PROJECT_SIZE_BYTES / 1024 / 1024,
  MAX_SINGLE_IMAGE_MB: MAX_SINGLE_IMAGE_BYTES / 1024 / 1024,
}

/**
 * Compress a single image data URL to WebP.
 * - Resizes if exceeding MAX_DIMENSION
 * - Converts to WebP at WEBP_QUALITY
 * - Falls back to JPEG if browser doesn't support WebP canvas export
 */
export async function compressImage(dataUrl: string): Promise<{
  data: string
  format: string
  originalSize: number
  compressedSize: number
  resized: boolean
  width: number
  height: number
}> {
  const originalSize = dataUrl.length

  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      let resized = false

      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const scale = MAX_DIMENSION / Math.max(width, height)
        width = Math.round(width * scale)
        height = Math.round(height * scale)
        resized = true
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)

      // Try WebP first
      let data = canvas.toDataURL('image/webp', WEBP_QUALITY)
      let format = 'webp'

      // Check if browser actually produced WebP (some old browsers fall back to PNG)
      if (!data.startsWith('data:image/webp')) {
        // Fallback to JPEG
        data = canvas.toDataURL('image/jpeg', 0.85)
        format = 'jpeg'
      }

      // If still too large, reduce quality
      if (data.length > MAX_SINGLE_IMAGE_BYTES) {
        data = canvas.toDataURL('image/webp', 0.6)
        format = 'webp'
        if (!data.startsWith('data:image/webp')) {
          data = canvas.toDataURL('image/jpeg', 0.7)
          format = 'jpeg'
        }
      }

      resolve({ data, format, originalSize, compressedSize: data.length, resized, width, height })
    }
    img.onerror = () => {
      resolve({ data: dataUrl, format: 'original', originalSize, compressedSize: originalSize, resized: false, width: 0, height: 0 })
    }
    img.src = dataUrl
  })
}

/**
 * Compress all images in a project for server upload.
 * Returns compressed project + summary. Throws if project exceeds max size.
 */
export async function compressProjectForServer(project: any): Promise<{
  project: any
  summary: { totalOriginalKB: number; totalCompressedKB: number; imagesProcessed: number }
}> {
  let totalOriginalKB = 0
  let totalCompressedKB = 0
  let imagesProcessed = 0

  const compressedImages = await Promise.all(
    (project.images || []).map(async (img: any) => {
      if (!img.data || !img.data.startsWith('data:image')) return img
      const result = await compressImage(img.data)
      totalOriginalKB += Math.round(result.originalSize / 1024)
      totalCompressedKB += Math.round(result.compressedSize / 1024)
      imagesProcessed++
      return { ...img, data: result.data }
    }),
  )

  const compressedProject = { ...project, images: compressedImages }

  // Check total project size
  const projectJson = JSON.stringify(compressedProject)
  const projectSizeBytes = new Blob([projectJson]).size
  if (projectSizeBytes > MAX_PROJECT_SIZE_BYTES) {
    throw new Error(
      `Project too large for server storage: ${Math.round(projectSizeBytes / 1024 / 1024 * 10) / 10} MB ` +
      `(max ${LIMITS.MAX_PROJECT_SIZE_MB} MB). Reduce image count or save locally for full quality.`
    )
  }

  return {
    project: compressedProject,
    summary: { totalOriginalKB, totalCompressedKB, imagesProcessed },
  }
}
