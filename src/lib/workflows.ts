import {
  base64ToBytes,
  readPlatformFileBinary,
  readPlatformTextFile,
  writePlatformFileBinary,
  writePlatformTextFile,
  bytesToBase64,
  readPlatformFileBinaryDataUrl,
  vision,
  type VisionGenerateRequest,
} from '../bridge/platformBridge'
import { importModel } from './importModel'
import { exportScene } from './threeScene'
import { validateTexture } from './textures'
import { descendants, resolveMaterial } from './scene'
import { meshGeometry } from './geometry'
import type { SceneStore } from './SceneStore'
import type { WorkspaceState } from './SceneStore'
import type { ViewportAPI } from '../components/SceneViewport'

export type ExportFormat = 'glb' | 'obj' | 'stl' | 'png'
export function toggleVertexEditing(store: SceneStore) {
  const { scene, selectedId, selectedVertex } = store.getSnapshot()
  const object = scene.objects.find(o => o.id === selectedId)
  if (!object || object.kind === 'group') return
  if (!object.geometry)
    store.edit([{ op: 'mesh', id: object.id, geometry: meshGeometry(object) }])
  store.workspace({ selectedVertex: selectedVertex === null ? 0 : null })
}
export async function produceExport(
  state: WorkspaceState,
  format: ExportFormat,
  viewport: ViewportAPI | null,
) {
  if (format !== 'png') return exportScene(state.scene, format, state.time)
  if (!viewport) throw new Error('Viewport renderer unavailable')
  return {
    data: base64ToBytes((await viewport.capture(state.time)).split(',')[1]),
    mimeType: 'image/png',
  }
}

export async function applyImageTexture(
  store: SceneStore,
  id: string,
  dataUrl: string,
) {
  const object = store.getSnapshot().scene.objects.find(o => o.id === id)
  if (!object) throw new Error('Select an object for the texture')
  const validated = await validateTexture(dataUrl)
  const assetId = crypto.randomUUID()
  store.edit([
    { op: 'addTextureAsset', asset: { id: assetId, dataUrl: validated } },
    {
      op: 'update',
      id,
      patch: { material: { texture: { assetId }, color: '#ffffff' } },
    },
  ])
  return assetId
}

export async function importWorkspaceTexture(
  store: SceneStore,
  id: string,
  path: string,
) {
  const data = await readPlatformFileBinaryDataUrl(path, 8 * 1024 * 1024)
  return applyImageTexture(store, id, data)
}

export async function generateObjectTexture(
  store: SceneStore,
  id: string,
  {
    prompt,
    size = '1024x1024',
    editExisting = false,
  }: Pick<VisionGenerateRequest, 'prompt' | 'size'> & {
    editExisting?: boolean
  },
) {
  const object = store.getSnapshot().scene.objects.find(o => o.id === id)
  if (!object) throw new Error('Select an object for the texture')
  const source = editExisting ? resolveMaterial(store.getSnapshot().scene, object).texture : null
  if (editExisting && !source)
    throw new Error('The object has no texture to edit')
  const asset = source
    ? store.getSnapshot().scene.textureAssets.find(item => item.id === source.assetId)
    : undefined
  if (source && !asset) throw new Error(`Unknown texture asset: ${source.assetId}`)
  const image = await vision.generate({
    prompt,
    size,
    quality: 'medium',
    outputFormat: 'png',
    background: 'opaque',
    ...(source
      ? {
          sourceImages: [
            {
              base64: asset!.dataUrl.split(',')[1],
              mimeType: asset!.dataUrl.slice(5, asset!.dataUrl.indexOf(';')),
              name: `${object.name} texture`,
            },
          ],
        }
      : {}),
  })
  const assetId = await applyImageTexture(
    store,
    id,
    `data:${image.mimeType};base64,${image.base64}`,
  )
  return { assetId, modelId: image.modelId, provider: image.provider }
}

type TextureTargets = {
  objectIds: string[]
  recursive?: boolean
}

function resolveTextureTargets(store: SceneStore, targets: TextureTargets) {
  const scene = store.getSnapshot().scene
  const knownIds = new Set(scene.objects.map(object => object.id))
  const missing = targets.objectIds.find(id => !knownIds.has(id))
  if (missing) throw new Error(`Unknown object: ${missing}`)
  const ids = new Set(targets.objectIds)
  if (targets.recursive)
    for (const id of targets.objectIds)
      for (const descendant of descendants(scene, id)) ids.add(descendant)
  return scene.objects.filter(object => ids.has(object.id))
}

export function applyTextureReference(
  store: SceneStore,
  { assetId, ...targets }: TextureTargets & { assetId: string },
) {
  const scene = store.getSnapshot().scene
  if (!scene.textureAssets.some(asset => asset.id === assetId))
    throw new Error(`Unknown texture asset: ${assetId}`)
  const objects = resolveTextureTargets(store, targets)
  store.edit(
    objects.map(object => ({
      op: 'update' as const,
      id: object.id,
      patch: { material: { texture: { assetId } } },
    })),
  )
  return objects.map(object => object.id)
}

type TexturePatch = {
  color?: string
  repeat?: [number, number]
  offset?: [number, number]
  rotation?: number
  flipY?: boolean
  wrapS?: 'repeat' | 'clamp' | 'mirror'
  wrapT?: 'repeat' | 'clamp' | 'mirror'
}

export function patchTextureReferences(
  store: SceneStore,
  { patch, ...targets }: TextureTargets & { patch: TexturePatch },
) {
  const scene = store.getSnapshot().scene
  const objects = resolveTextureTargets(store, targets)
  const { color, ...binding } = patch
  const updatesTexture = Object.keys(binding).length > 0
  if (updatesTexture) {
    const missingTexture = objects.find(
      object => !resolveMaterial(scene, object).texture,
    )
    if (missingTexture)
      throw new Error(`Object has no resolved texture: ${missingTexture.id}`)
  }
  store.edit(
    objects.map(object => ({
      op: 'update' as const,
      id: object.id,
      patch: {
        material: {
          ...(color === undefined ? {} : { color }),
          ...(updatesTexture ? { texture: binding } : {}),
        },
      },
    })),
  )
  return objects.map(object => object.id)
}

export async function importWorkspaceModel(store: SceneStore, path: string) {
  const extension = path.split('.').pop()!.toLowerCase()
  const data =
    extension === 'obj'
      ? await readPlatformTextFile(path)
      : base64ToBytes(
          (await readPlatformFileBinary(path, 32 * 1024 * 1024)).base64,
        )
  const objects = await importModel(data, extension, path.split(/[\\/]/).pop())
  store.edit([
    ...objects.textureAssets.map(asset => ({ op: 'addTextureAsset' as const, asset })),
    ...objects.map(object => ({ op: 'add' as const, object })),
  ])
  store.workspace({ selectedId: objects[0].id })
  return objects.map(o => o.id)
}
export async function exportWorkspaceModel(
  store: SceneStore,
  path: string,
  format: ExportFormat,
  viewport: ViewportAPI | null = null,
) {
  if (!path.toLowerCase().endsWith(`.${format}`))
    throw new Error(`Export path must end in .${format}`)
  const state = store.getSnapshot()
  const result = await produceExport(state, format, viewport)
  if (typeof result.data === 'string')
    await writePlatformTextFile(path, result.data)
  else await writePlatformFileBinary(path, bytesToBase64(result.data))
  return {
    path,
    time: state.time,
  }
}
