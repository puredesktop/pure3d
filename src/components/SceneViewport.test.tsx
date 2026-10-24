// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
const rendered = vi.hoisted(() => ({ draw: vi.fn(), animation: vi.fn(), resize: vi.fn(), sizable: true }))
const decoded = vi.hoisted(() => ({ pixels: vi.fn<(url: string) => Promise<ArrayLike<number> | null>>() }))
vi.mock('../lib/captureCheck', async importOriginal => ({
  ...(await importOriginal<typeof import('../lib/captureCheck')>()),
  decodeCapturePixels: (url: string) => decoded.pixels(url),
}))
vi.mock('three', async importOriginal => {
  const real = await importOriginal<typeof import('three')>()
  class Renderer {
    domElement = document.createElement('canvas')
    setPixelRatio() {}; setScissorTest() {}
    setSize(width: number, height: number, style?: boolean) {
      rendered.resize(width, height, style)
      if (rendered.sizable) Object.assign(this.domElement, { width, height })
    }
    getSize(target: { set: (x: number, y: number) => unknown }) { return target.set(this.domElement.width, this.domElement.height) }
   ; setViewport() {}; setClearColor() {}; clear() {}; setScissor() {}
    render(...args: unknown[]) { rendered.draw(...args) }
    setAnimationLoop(...args: unknown[]) { rendered.animation(...args) }
    getContext() { return { isContextLost: () => false } }
    dispose() {}
  }
  return { ...real, WebGLRenderer: Renderer }
})
import * as THREE from 'three'
import { SceneViewport, type ViewportAPI } from './SceneViewport'
import { SceneStore } from '../lib/SceneStore'
import { emptyScene, makeObject } from '../lib/scene'
let root: Root, store: SceneStore
let jobs: Map<number, FrameRequestCallback>, sequence: number
const api = { current: null as ViewportAPI | null }
const onError = vi.fn()
const runFrame = async () => { await act(async () => { const callbacks = [...jobs.values()]; jobs.clear(); callbacks.forEach(callback => callback(0)) }) }
beforeEach(() => {
  vi.clearAllMocks(); jobs = new Map(); sequence = 0; rendered.sizable = true
  decoded.pixels.mockResolvedValue(new Uint8ClampedArray([21, 21, 21, 255]))
  delete document.documentElement.dataset.platformTheme
  delete document.documentElement.dataset.platformAppearance
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal('devicePixelRatio', 1)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { jobs.set(++sequence, callback); return sequence })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => jobs.delete(id))
  vi.stubGlobal('ResizeObserver', class { observe() {}; disconnect() {} })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(640)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(480)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AA==')
  const scene = emptyScene(); scene.objects = [makeObject()]; store = new SceneStore(scene)
  root = createRoot(document.createElement('div'))
})
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const mount = async () => { await act(async () => root.render(<SceneViewport store={store} api={api} onError={onError} />)) }
it('persists the camera when the viewport closes before its navigation save timer fires', async () => {
  vi.useFakeTimers()
  await mount()
  const originalCamera = store.getDocument().settings.camera
  const persisted = vi.fn()
  store.subscribe(change => { if (change.persisted) persisted() })

  await act(async () => api.current!.frame())
  const camera = store.getCameraSnapshot()
  expect(camera).not.toEqual(originalCamera)
  await act(async () => { vi.advanceTimersByTime(249) })
  expect(persisted).not.toHaveBeenCalled()
  expect(store.getDocument().settings.camera).toEqual(originalCamera)

  await act(async () => root.render(null))
  expect(persisted).toHaveBeenCalledTimes(1)
  expect(store.getDocument().settings.camera).toEqual(camera)
  expect(store.getSnapshot().canUndo).toBe(false)
  await act(async () => { vi.advanceTimersByTime(250) })
  expect(persisted).toHaveBeenCalledTimes(1)
})
it('draws once while idle, redraws for an edit and leaves no perpetual animation loop', async () => {
  await mount(); await runFrame()
  expect(rendered.draw).toHaveBeenCalledTimes(1)
  expect(jobs.size).toBe(0)
  expect(rendered.animation).not.toHaveBeenCalled()
  await act(async () => store.edit([{ op: 'update', id: store.getSnapshot().scene.objects[0].id, patch: { name: 'Renamed' } }]))
  await runFrame()
  expect(rendered.draw).toHaveBeenCalledTimes(2)
  expect(jobs.size).toBe(0)
})
it('updates the default viewport background when the platform theme changes', async () => {
  document.documentElement.dataset.platformTheme = 'dark'
  await mount(); await runFrame()
  let renderedScene = rendered.draw.mock.calls.at(-1)![0] as THREE.Scene
  expect(renderedScene.background).toMatchObject({ r: expect.any(Number) })
  expect((renderedScene.background as THREE.Color).getHexString()).toBe('0d2a52')
  document.documentElement.dataset.platformTheme = 'light'
  await act(async () => { await Promise.resolve() })
  await runFrame()
  renderedScene = rendered.draw.mock.calls.at(-1)![0] as THREE.Scene
  expect((renderedScene.background as THREE.Color).getHexString()).toBe('bfe9ff')
})
it('rejects capture when the scene changes while textures are loading', async () => {
  let complete!: (image: HTMLImageElement) => void
  vi.spyOn(THREE.ImageLoader.prototype, 'load').mockImplementation((_url, onLoad) => { complete = onLoad!; return {} as HTMLImageElement })
  const scene = store.getSnapshot().scene, object = scene.objects[0]
  scene.textureAssets = [{ id: 'image', dataUrl: 'data:image/png;base64,AA==' }]
  object.material.texture = { assetId: 'image' }; store.replace(scene)
  await mount()
  const capturing = api.current!.capture()
  await act(async () => store.edit([{ op: 'update', id: object.id, patch: { name: 'Changed during capture' } }]))
  complete({ width: 2, height: 2 } as HTMLImageElement)
  await expect(capturing).rejects.toThrow('Scene changed')
})
it('restores the current pose after capturing a different animation time', async () => {
  const scene = store.getSnapshot().scene, object = scene.objects[0]
  scene.keyframes = [{ objectId: object.id, property: 'position', time: 0, value: [0, 0, 0], easing: 'linear' }, { objectId: object.id, property: 'position', time: 5, value: [5, 0, 0], easing: 'linear' }]
  store.replace(scene); await mount(); await runFrame()
  await act(async () => { await api.current!.capture(3) })
  const renderedScene = rendered.draw.mock.calls.at(-1)![0] as THREE.Scene
  expect(renderedScene.getObjectByName(object.id)!.position.x).toBe(0)
  expect(store.getSnapshot().time).toBe(0)
})
it('draws a fresh frame at the on-screen size before capturing', async () => {
  await mount()
  rendered.draw.mockClear()
  await act(async () => { expect(await api.current!.capture()).toBe('data:image/png;base64,AA==') })
  expect(rendered.resize).toHaveBeenCalledWith(640, 480, false)
  expect(rendered.draw).toHaveBeenCalledTimes(1)
})
it('renders a hidden viewport at its last known size, or a fixed size if it was never shown', async () => {
  const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(0)
  const height = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(0)
  await mount()
  await act(async () => { await api.current!.capture() })
  expect(rendered.resize).toHaveBeenLastCalledWith(1280, 720, false)
  expect(rendered.draw).toHaveBeenCalledTimes(1)
  width.mockReturnValue(800); height.mockReturnValue(450)
  await runFrame()
  await act(async () => store.edit([{ op: 'update', id: store.getSnapshot().scene.objects[0].id, patch: { name: 'Seen' } }]))
  await runFrame()
  width.mockReturnValue(0); height.mockReturnValue(0)
  await act(async () => { await api.current!.capture() })
  expect(rendered.resize).toHaveBeenLastCalledWith(800, 450, false)
})
it('refuses a blank capture instead of returning a transparent or unsized image', async () => {
  // A canvas that cannot be sized keeps the HTML default 300x150.
  rendered.sizable = false
  await mount()
  await expect(api.current!.capture()).rejects.toThrow("The viewport isn't drawn (Pure3D is not on screen)")
  expect(decoded.pixels).not.toHaveBeenCalled()
  // A sized canvas whose pixels read back fully transparent.
  rendered.sizable = true
  decoded.pixels.mockResolvedValue(new Uint8ClampedArray(16))
  await expect(api.current!.capture()).rejects.toThrow('capture again once it is, or use getScene')
  decoded.pixels.mockResolvedValue(new Uint8ClampedArray([21, 21, 21, 255]))
  await expect(api.current!.capture()).resolves.toBe('data:image/png;base64,AA==')
})
