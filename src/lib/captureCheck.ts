/**
 * Viewport captures must never hand back a blank picture. A canvas that was
 * never sized stays at the HTML default 300x150, and a WebGL canvas that was
 * never drawn reads back fully transparent; both are refused.
 */

export const DEFAULT_CANVAS_SIZE = { width: 300, height: 150 }
/** Used when the viewport has never been on screen, so has no known size. */
export const FALLBACK_CAPTURE_SIZE = { width: 1280, height: 720 }
export const BLANK_CAPTURE_MESSAGE =
  "The viewport isn't drawn (Pure3D is not on screen); capture again once it is, or use getScene"

export const isDefaultCanvasSize = (width: number, height: number) =>
  width === DEFAULT_CANVAS_SIZE.width && height === DEFAULT_CANVAS_SIZE.height

export function allTransparent(rgba: ArrayLike<number>) {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 0) return false
  return true
}

export type PixelDecoder = (dataUrl: string) => Promise<ArrayLike<number> | null>

/** RGBA pixels of a PNG data URL, or null where the platform cannot decode offscreen. */
export const decodeCapturePixels: PixelDecoder = async dataUrl => {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function')
    return null
  const [header, base64 = ''] = dataUrl.split(',')
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  const type = /^data:([^;,]+)/.exec(header)?.[1] ?? 'image/png'
  const bitmap = await createImageBitmap(new Blob([bytes], { type }))
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(bitmap, 0, 0)
    return context.getImageData(0, 0, bitmap.width, bitmap.height).data
  } finally {
    bitmap.close()
  }
}

/** True when a capture carries no picture: unsized canvas, empty data URL, or every pixel transparent. */
export async function isBlankCapture(
  canvas: { width: number; height: number },
  dataUrl: string,
  decode: PixelDecoder = decodeCapturePixels,
) {
  if (!canvas.width || !canvas.height || isDefaultCanvasSize(canvas.width, canvas.height))
    return true
  if (!/^data:image\/png;base64,./.test(dataUrl)) return true
  const pixels = await decode(dataUrl).catch(() => null)
  return !!pixels && allTransparent(pixels)
}
