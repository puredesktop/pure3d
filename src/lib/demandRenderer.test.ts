import { expect, it, vi } from 'vitest'
import { demandRenderer } from './demandRenderer'
function fixture(draw: () => boolean) {
  let id = 0
  const callbacks = new Map<number, FrameRequestCallback>()
  const cancel = vi.fn((key: number) => callbacks.delete(key))
  const renderer = demandRenderer(draw, { request: callback => { callbacks.set(++id, callback); return id }, cancel })
  const frame = () => { const jobs = [...callbacks.values()]; callbacks.clear(); jobs.forEach(job => job(0)) }
  return { renderer, frame, callbacks, cancel }
}
it('coalesces edits into one frame and stays idle afterward', () => {
  const draw = vi.fn(() => false), { renderer, frame, callbacks } = fixture(draw)
  for (let i = 0; i < 100; i++) renderer.invalidate()
  expect(callbacks.size).toBe(1)
  frame()
  expect(draw).toHaveBeenCalledTimes(1)
  expect(callbacks.size).toBe(0)
  renderer.invalidate(); frame()
  expect(draw).toHaveBeenCalledTimes(2)
})
it('renders continuously only while requested', () => {
  let playing = true
  const draw = vi.fn(() => playing), { renderer, frame, callbacks } = fixture(draw)
  renderer.invalidate(); frame(); frame()
  expect(draw).toHaveBeenCalledTimes(2)
  expect(callbacks.size).toBe(1)
  playing = false; frame()
  expect(callbacks.size).toBe(0)
})
it('cancels pending work and ignores invalidations after disposal', () => {
  const draw = vi.fn(() => false), { renderer, frame, cancel, callbacks } = fixture(draw)
  renderer.invalidate(); renderer.dispose(); renderer.invalidate(); frame()
  expect(draw).not.toHaveBeenCalled()
  expect(cancel).toHaveBeenCalledTimes(1)
  expect(callbacks.size).toBe(0)
})

it('calls native frame APIs with the global receiver', () => {
  const request = vi.fn(function(this: unknown, _callback: FrameRequestCallback) { expect(this).toBe(globalThis); return 1 })
  const cancel = vi.fn(function(this: unknown, _id: number) { expect(this).toBe(globalThis) })
  vi.stubGlobal('requestAnimationFrame', request)
  vi.stubGlobal('cancelAnimationFrame', cancel)
  try {
    const renderer = demandRenderer(() => false)
    renderer.invalidate(); renderer.dispose()
    expect(request).toHaveBeenCalledTimes(1)
    expect(cancel).toHaveBeenCalledWith(1)
  } finally { vi.unstubAllGlobals() }
})
