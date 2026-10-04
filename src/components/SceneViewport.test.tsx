// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
const rendered = vi.hoisted(() => ({ draw: vi.fn(), animation: vi.fn() }))
vi.mock('three', async importOriginal => {
  const real = await importOriginal<typeof import('three')>()
  class Renderer {
    domElement = document.createElement('canvas')
    setPixelRatio() {}; setSize() {}; setScissorTest() {}; setViewport() {}; setClearColor() {}; clear() {}; setScissor() {}
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
  vi.clearAllMocks(); jobs = new Map(); sequence = 0
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
afterEach(async () => { await act(async () => root.unmount()); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const mount = async () => { await act(async () => root.render(<SceneViewport store={store} api={api} onError={onError} />)) }
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
