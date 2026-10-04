import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import * as THREE from 'three'
const bridge = vi.hoisted(() => ({ generate: vi.fn(), read: vi.fn(), image: vi.fn() }))
vi.mock('../bridge/platformBridge', () => ({
  vision: { generate: bridge.generate }, readPlatformTextFile: bridge.read, readPlatformFileBinaryDataUrl: bridge.image,
  readPlatformFileBinary: vi.fn(), writePlatformTextFile: vi.fn(), writePlatformFileBinary: vi.fn(),
  bytesToBase64: vi.fn(), base64ToBytes: vi.fn(),
}))
import { SceneStore } from './SceneStore'
import { emptyScene, makeObject, resolveMaterial } from './scene'
import { applyImageTexture, generateObjectTexture, importWorkspaceModel, importWorkspaceTexture } from './workflows'
let complete!: (image: HTMLImageElement) => void
beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(THREE.ImageLoader.prototype, 'load').mockImplementation((_url, onLoad) => { complete = onLoad!; return {} as HTMLImageElement })
})
afterEach(() => vi.restoreAllMocks())
const setup = () => { const scene = emptyScene(), object = makeObject(); scene.objects = [object]; return { store: new SceneStore(scene), scene, object } }
const replaceSameIds = (store: SceneStore) => { const next = structuredClone(store.getSnapshot().scene); next.title = 'Different document'; store.replace(next) }
it('does not apply a decoded image to a different document with reused IDs', async () => {
  const { store, object } = setup()
  const applying = applyImageTexture(store, object.id, 'data:image/png;base64,AA==')
  replaceSameIds(store)
  complete({ width: 2, height: 2 } as HTMLImageElement)
  await expect(applying).rejects.toThrow('scene changed')
  expect(store.getSnapshot().scene.textureAssets).toHaveLength(0)
})
it('does not apply or decode generation results after a document switch', async () => {
  const { store, object } = setup()
  let release!: (image: unknown) => void
  bridge.generate.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
  const generating = generateObjectTexture(store, object.id, { prompt: 'Surface' })
  replaceSameIds(store)
  release({ mimeType: 'image/png', base64: 'AA==', modelId: 'mock', provider: 'mock' })
  await expect(generating).rejects.toThrow('scene changed')
  expect(THREE.ImageLoader.prototype.load).not.toHaveBeenCalled()
  expect(store.getSnapshot().scene.textureAssets).toHaveLength(0)
})
it('does not apply a late workspace texture read after a document switch', async () => {
  const { store, object } = setup()
  let release!: (value: string) => void
  bridge.image.mockImplementationOnce(() => new Promise<string>(resolve => { release = resolve }))
  const importing = importWorkspaceTexture(store, object.id, '/texture.png')
  replaceSameIds(store); release('data:image/png;base64,AA==')
  await expect(importing).rejects.toThrow('scene changed')
  expect(THREE.ImageLoader.prototype.load).not.toHaveBeenCalled()
})
it('does not insert late imported geometry into a newly opened document', async () => {
  const { store } = setup()
  let release!: (value: string) => void
  bridge.read.mockImplementationOnce(() => new Promise<string>(resolve => { release = resolve }))
  const importing = importWorkspaceModel(store, '/triangle.obj')
  replaceSameIds(store); release('o Triangle\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3')
  await expect(importing).rejects.toThrow('scene changed')
  expect(store.getSnapshot().scene.objects).toHaveLength(1)
})
it('preserves edits during decoding and permits an inherited group texture', async () => {
  const scene = emptyScene(), group = makeObject('group'), child = makeObject()
  child.parentId = group.id; scene.objects = [group, child]
  const store = new SceneStore(scene)
  const applying = applyImageTexture(store, group.id, 'data:image/png;base64,AA==')
  store.edit([{ op: 'update', id: child.id, patch: { name: 'Edited child', material: { roughness: 0.8 } } }])
  complete({ width: 2, height: 2 } as HTMLImageElement); const assetId = await applying
  const current = store.getSnapshot().scene, object = current.objects.find(o => o.id === child.id)!
  expect(object.name).toBe('Edited child')
  expect(resolveMaterial(current, object)).toMatchObject({ roughness: 0.8, texture: { assetId } })
})
