import * as THREE from 'three'
import { textureSchema } from './schemas.mjs'
import type { SceneDocument, SceneObject } from '../types'

export type ImageTexture = Pick<SceneDocument['textureAssets'][number], 'dataUrl'>
export type TextureBinding = NonNullable<SceneObject['material']['texture']>
const wrapping = {
  repeat: THREE.RepeatWrapping,
  clamp: THREE.ClampToEdgeWrapping,
  mirror: THREE.MirroredRepeatWrapping,
}

function configureTexture(texture: THREE.Texture, binding: TextureBinding) {
  texture.colorSpace = THREE.SRGBColorSpace
  texture.repeat.fromArray(binding.repeat ?? [1, 1])
  texture.offset.fromArray(binding.offset ?? [0, 0])
  texture.rotation = binding.rotation ?? 0
  texture.flipY = binding.flipY ?? true
  texture.wrapS = wrapping[binding.wrapS ?? 'repeat']
  texture.wrapT = wrapping[binding.wrapT ?? 'repeat']
}

/**
 * Keeps one decoded image and GPU source per embedded asset for a viewport.
 * Texture clones deliberately share that source, but retain independent UV
 * transforms for every material that uses it.
 */
export class TextureAssetCache {
  private entries = new Map<
    string,
    { texture: THREE.Texture; ready: Promise<void> }
  >()

  texture(asset: ImageTexture & { id: string }, binding: TextureBinding) {
    const key = `${asset.id}:${asset.dataUrl}`
    let entry = this.entries.get(key)
    if (!entry) {
      const loaded = loadTexture(asset, { assetId: asset.id })
      entry = loaded
      this.entries.set(key, entry)
    }
    const texture = entry.texture.clone()
    configureTexture(texture, binding)
    return { texture, ready: entry.ready }
  }

  /** Drop decoded sources that no longer belong to the reconciled document. */
  retain(assets: readonly (ImageTexture & { id: string })[]) {
    const active = new Set(assets.map(asset => `${asset.id}:${asset.dataUrl}`))
    for (const [key, entry] of this.entries)
      if (!active.has(key)) {
        entry.texture.dispose()
        const image = entry.texture.image
        if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap)
          image.close()
        this.entries.delete(key)
      }
  }

  dispose() {
    this.retain([])
  }
}

export function loadTexture(value: ImageTexture, binding: TextureBinding) {
  const texture = new THREE.Texture()
  const ready = new Promise<void>((resolve, reject) => {
    new THREE.ImageLoader().load(
      value.dataUrl,
      image => {
        if (image.width > 8192 || image.height > 8192) {
          reject(new Error('Textures must be at most 8192 pixels per side'))
        } else {
          texture.image = image
          texture.needsUpdate = true
          resolve()
        }
      },
      undefined,
      () => reject(new Error('Unable to decode the texture image')),
    )
  })
  configureTexture(texture, binding)
  return { texture, ready }
}

export async function validateTexture(dataUrl: string): Promise<string> {
  const value = textureSchema.parse({ dataUrl })
  const loaded = loadTexture(value, { assetId: 'validation' })
  try {
    await loaded.ready
  } finally {
    loaded.texture.dispose()
  }
  return value.dataUrl
}

export function textureFromMap(map: THREE.Texture): { dataUrl: string; binding: Omit<TextureBinding, 'assetId'> } {
  if (map.channel !== 0)
    throw new Error('Only the primary UV channel is supported')
  const image = map.image
  if (
    !(image instanceof HTMLImageElement) &&
    !(image instanceof HTMLCanvasElement) &&
    !(typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap)
  )
    throw new Error('Only decoded image textures can be imported')
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  if (canvas.width > 8192 || canvas.height > 8192)
    throw new Error('Textures must be at most 8192 pixels per side')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Texture image conversion unavailable')
  context.drawImage(image, 0, 0)
  const wrap = (mode: THREE.Wrapping) =>
    mode === THREE.RepeatWrapping
      ? 'repeat'
      : mode === THREE.MirroredRepeatWrapping
      ? 'mirror'
      : 'clamp'
  const { dataUrl, ...binding } = textureSchema.parse({
    dataUrl: canvas.toDataURL('image/png'),
    repeat: map.repeat.toArray(),
    offset: map.offset.toArray(),
    rotation: map.rotation,
    flipY: map.flipY,
    wrapS: wrap(map.wrapS),
    wrapT: wrap(map.wrapT),
  })
  return { dataUrl, binding }
}
