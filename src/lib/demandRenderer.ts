/** One queued frame for edits; continuous frames only while draw requests them. */
export function demandRenderer(draw: () => boolean, frames: { request: (callback: FrameRequestCallback) => number; cancel: (id: number) => void } = {
  request: callback => globalThis.requestAnimationFrame(callback),
  cancel: id => globalThis.cancelAnimationFrame(id),
}) {
  let frame: number | null = null
  let disposed = false
  const invalidate = () => {
    if (disposed || frame !== null) return
    frame = frames.request(() => {
      frame = null
      if (!disposed && draw()) invalidate()
    })
  }
  return {
    invalidate,
    dispose() { disposed = true; if (frame !== null) frames.cancel(frame); frame = null },
  }
}
