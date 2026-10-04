import { afterEach, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { TextureAssetCache } from './textures'
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
it('cancels discarded pending images and closes late decoded bitmaps', async () => {
  let complete!: (image: HTMLImageElement) => void
  class Bitmap { width = 2; height = 2; close = vi.fn() }
  vi.stubGlobal('ImageBitmap', Bitmap)
  vi.spyOn(THREE.ImageLoader.prototype, 'load').mockImplementation((_url, onLoad) => { complete = onLoad!; return {} as HTMLImageElement })
  const cache = new TextureAssetCache(), loaded = cache.texture({ id: 'image', dataUrl: 'data:image/png;base64,AA==' }, { assetId: 'image' })
  const rejected = expect(loaded.ready).rejects.toThrow('cancelled')
  cache.dispose(); await rejected
  const image = new Bitmap()
  complete(image as unknown as HTMLImageElement)
  expect(image.close).toHaveBeenCalledTimes(1)
  expect(loaded.texture.image).toBeNull()
  loaded.texture.dispose()
})
it('allows a failed decode to be retried instead of reusing its rejected promise', async () => {
  const load = vi.spyOn(THREE.ImageLoader.prototype, 'load').mockImplementationOnce((_url, _complete, _progress, error) => { error?.(new Error('Bad image')); return {} as HTMLImageElement }).mockImplementation((_url, complete) => { complete?.({ width: 2, height: 2 } as HTMLImageElement); return {} as HTMLImageElement })
  const cache = new TextureAssetCache(), asset = { id: 'image', dataUrl: 'data:image/png;base64,AA==' }
  const first = cache.texture(asset, { assetId: 'image' })
  await expect(first.ready).rejects.toThrow('Unable to decode')
  const second = cache.texture(asset, { assetId: 'image' })
  await expect(second.ready).resolves.toBeUndefined()
  expect(load).toHaveBeenCalledTimes(2)
  first.texture.dispose(); second.texture.dispose(); cache.dispose()
})
