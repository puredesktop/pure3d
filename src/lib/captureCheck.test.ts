import { describe, expect, it, vi } from 'vitest'
import { allTransparent, isBlankCapture, isDefaultCanvasSize } from './captureCheck'

const png = 'data:image/png;base64,iVBORw0KGgo='
describe('blank capture detection', () => {
  it('treats the default 300x150 canvas, an empty data URL and all-transparent pixels as blank', async () => {
    const decode = vi.fn().mockResolvedValue(new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 0]))
    expect(isDefaultCanvasSize(300, 150)).toBe(true)
    expect(await isBlankCapture({ width: 300, height: 150 }, png, decode)).toBe(true)
    expect(decode).not.toHaveBeenCalled()
    expect(await isBlankCapture({ width: 640, height: 480 }, 'data:,', decode)).toBe(true)
    expect(await isBlankCapture({ width: 640, height: 480 }, png, decode)).toBe(true)
    expect(decode).toHaveBeenCalledWith(png)
  })
  it('accepts drawn pixels and does not guess when pixels cannot be decoded', async () => {
    expect(allTransparent([0, 0, 0, 0, 21, 21, 21, 255])).toBe(false)
    expect(await isBlankCapture({ width: 640, height: 480 }, png, async () => new Uint8ClampedArray([21, 21, 21, 255]))).toBe(false)
    expect(await isBlankCapture({ width: 640, height: 480 }, png, async () => null)).toBe(false)
    expect(await isBlankCapture({ width: 640, height: 480 }, png, async () => { throw new Error('no decoder') })).toBe(false)
  })
})
