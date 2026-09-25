import { sceneSchema, operationSchema } from './schemas.mjs'
import { meshGeometry, moveVertex, boxUV } from './geometry'
import type {
  SceneDocument,
  SceneObject,
  Operation,
  Keyframe,
  Vec3,
} from '../types'

export type ResolvedMaterial = {
  color: string
  metalness: number
  roughness: number
  opacity: number
  wireframe: boolean
  texture: NonNullable<SceneObject['material']['texture']> | null
}
const defaultMaterial: ResolvedMaterial = {
  color: '#7b9dcc',
  metalness: 0.1,
  roughness: 0.5,
  opacity: 1,
  wireframe: false,
  texture: null,
}

export function resolveMaterial(scene: SceneDocument, object: SceneObject): ResolvedMaterial {
  const chain: SceneObject[] = []
  let current: SceneObject | undefined = object
  while (current) {
    chain.unshift(current)
    current = current.parentId
      ? scene.objects.find(candidate => candidate.id === current!.parentId)
      : undefined
  }
  const resolved = { ...defaultMaterial }
  for (const entry of chain) {
    const { texture, ...properties } = entry.material
    Object.assign(resolved, properties)
    if (texture !== undefined)
      resolved.texture = texture
        ? { ...texture }
        : null
  }
  return resolved
}

function migrateScene(value: unknown) {
  if (!value || typeof value !== 'object') return value
  const scene = structuredClone(value) as Record<string, unknown>
  const assets = Array.isArray(scene.textureAssets) ? scene.textureAssets : []
  const byImage = new Map<string, string>()
  for (const asset of assets as { id?: string; dataUrl?: string }[])
    if (asset.id && asset.dataUrl) byImage.set(asset.dataUrl, asset.id)
  for (const object of (Array.isArray(scene.objects) ? scene.objects : []) as Record<string, unknown>[]) {
    const material = object.material as Record<string, unknown> | undefined
    const texture = material?.texture as Record<string, unknown> | null | undefined
    if (!texture || typeof texture.dataUrl !== 'string') continue
    let assetId = byImage.get(texture.dataUrl)
    if (!assetId) {
      assetId = crypto.randomUUID()
      byImage.set(texture.dataUrl, assetId)
      assets.push({ id: assetId, dataUrl: texture.dataUrl })
    }
    const { dataUrl, ...binding } = texture
    material!.texture = { assetId, ...binding }
  }
  scene.textureAssets = assets
  return scene
}

export const identityTransform = () => ({
  position: [0, 0, 0] as Vec3,
  rotation: [0, 0, 0] as Vec3,
  scale: [1, 1, 1] as Vec3,
})
export function makeObject(
  kind: SceneObject['kind'] = 'box',
  name: string = kind,
): SceneObject {
  if (kind === 'mesh')
    throw new Error('Mesh creation requires triangle geometry')
  return {
    id: crypto.randomUUID(),
    name,
    kind,
    parentId: null,
    visible: true,
    transform: identityTransform(),
    material: {},
    geometry: null,
  }
}
export function emptyScene(title = 'Untitled scene'): SceneDocument {
  return {
    format: 'pure3d',
    version: 1,
    id: crypto.randomUUID(),
    title,
    textureAssets: [],
    objects: [],
    keyframes: [],
    settings: {
      duration: 5,
      fps: 30,
      background: '#e9edf2',
      grid: true,
      camera: { position: [6, 4, 7], target: [0, 0, 0] },
    },
  }
}
export function parseScene(value: unknown): SceneDocument {
  const scene = sceneSchema.parse(migrateScene(value))
  if (scene.id === 'new') scene.id = crypto.randomUUID()
  return scene
}
export function descendants(scene: SceneDocument, id: string): Set<string> {
  const ids = new Set([id])
  let changed = true
  while (changed) {
    changed = false
    for (const o of scene.objects)
      if (o.parentId && ids.has(o.parentId) && !ids.has(o.id)) {
        ids.add(o.id)
        changed = true
      }
  }
  return ids
}
export function applyOperations(
  scene: SceneDocument,
  input: unknown[],
): SceneDocument {
  const operations = input.map(op => operationSchema.parse(op))
  const next = structuredClone(scene)
  const find = (id: string) => {
    const o = next.objects.find(o => o.id === id)
    if (!o) throw new Error(`Unknown object: ${id}`)
    return o
  }
  const provisionTextureUVs = () => {
    for (const object of next.objects)
      if (
        object.geometry &&
        !object.geometry.uv &&
        resolveMaterial(next, object).texture
      )
        object.geometry = boxUV(object.geometry)
  }
  for (const op of operations) {
    switch (op.op) {
      case 'cameraKeyframe':
        next.cameraKeys = [...(next.cameraKeys ?? []).filter(k => k.time !== op.keyframe.time), op.keyframe].sort((a, b) => a.time - b.time)
        break
      case 'removeCameraKeyframe':
        next.cameraKeys = (next.cameraKeys ?? []).filter(k => k.time !== op.time)
        break
      case 'addTextureAsset':
        if (next.textureAssets.some(asset => asset.id === op.asset.id))
          throw new Error(`Duplicate texture asset: ${op.asset.id}`)
        next.textureAssets.push(op.asset)
        break
      case 'deleteTextureAsset':
        if (!next.textureAssets.some(asset => asset.id === op.id))
          throw new Error(`Unknown texture asset: ${op.id}`)
        if (next.objects.some(object => object.material.texture?.assetId === op.id))
          throw new Error('Cannot delete a texture asset that has local bindings')
        next.textureAssets = next.textureAssets.filter(asset => asset.id !== op.id)
        break
      case 'add':
        next.objects.push(op.object)
        break
      case 'update': {
        const o = find(op.id)
        const { transform, material, ...fields } = op.patch
        Object.assign(o, fields)
        if (transform) Object.assign(o.transform, transform)
        if (material) {
          const { texture, ...properties } = material
          Object.assign(o.material, properties)
          if (texture !== undefined) {
            const inherited = resolveMaterial(next, o).texture
            o.material.texture = texture
              ? ({ ...(inherited ?? {}), ...(o.material.texture ?? {}), ...texture } as NonNullable<
                  SceneObject['material']['texture']
                >)
              : null
          }
        }
        break
      }
      case 'clearMaterialOverride': {
        const o = find(op.id)
        o.material = {}
        break
      }
      case 'delete': {
        find(op.id)
        const ids = descendants(next, op.id)
        next.objects = next.objects.filter(o => !ids.has(o.id))
        next.keyframes = next.keyframes.filter(k => !ids.has(k.objectId))
        break
      }
      case 'duplicate': {
        const root = find(op.id)
        const ids = descendants(next, op.id)
        const remap = new Map(
          [...ids].map(id => [
            id,
            id === op.id ? op.newId : crypto.randomUUID(),
          ]),
        )
        next.objects.push(
          ...next.objects
            .filter(o => ids.has(o.id))
            .map(o => ({
              ...structuredClone(o),
              id: remap.get(o.id)!,
              name: `${o.name} copy`,
              parentId: o.id === root.id ? o.parentId : remap.get(o.parentId!)!,
            })),
        )
        next.keyframes.push(
          ...next.keyframes
            .filter(k => ids.has(k.objectId))
            .map(k => ({
              ...structuredClone(k),
              objectId: remap.get(k.objectId)!,
            })),
        )
        break
      }
      case 'mesh': {
        const o = find(op.id)
        o.kind = 'mesh'
        o.geometry = op.geometry
        break
      }
      case 'moveVertex': {
        const o = find(op.id)
        if (!o.geometry)
          throw new Error('Convert the shape to an editable mesh first')
        o.geometry = moveVertex(o.geometry, op.index, op.position)
        break
      }
      case 'subdivide': {
        const o = find(op.id)
        o.geometry = meshGeometry(o, true)
        o.kind = 'mesh'
        break
      }
      case 'unwrap': {
        const o = find(op.id)
        o.geometry = boxUV(meshGeometry(o))
        o.kind = 'mesh'
        break
      }
      case 'keyframe': {
        const k = op.keyframe
        find(k.objectId)
        next.keyframes = next.keyframes.filter(
          e =>
            !(
              e.objectId === k.objectId &&
              e.property === k.property &&
              e.time === k.time
            ),
        )
        next.keyframes.push(k)
        break
      }
      case 'removeKeyframe':
        next.keyframes = next.keyframes.filter(
          k =>
            !(
              k.objectId === op.objectId &&
              k.property === op.property &&
              k.time === op.time
            ),
        )
        break
      case 'settings':
        if (op.title !== undefined) next.title = op.title
        if (op.settings) Object.assign(next.settings, op.settings)
        break
    }
  }
  provisionTextureUVs()
  next.keyframes.sort((a, b) => a.time - b.time)
  return parseScene(next)
}
export function sampleProperty(
  base: Vec3,
  keys: Keyframe[],
  time: number,
): Vec3 {
  if (!keys.length) return [...base]
  const sorted = [...keys].sort((a, b) => a.time - b.time)
  if (time <= sorted[0].time) return [...sorted[0].value]
  const last = sorted[sorted.length - 1]
  if (time >= last.time) return [...last.value]
  const i = sorted.findIndex(k => k.time > time)
  const a = sorted[i - 1]
  const b = sorted[i]
  let t = (time - a.time) / (b.time - a.time)
  if (a.easing === 'step') t = 0
  if (a.easing === 'smooth') t = t * t * (3 - 2 * t)
  return a.value.map((n, axis) => n + (b.value[axis] - n) * t) as Vec3
}
export function pose(scene: SceneDocument, object: SceneObject, time: number) {
  return Object.fromEntries(
    (['position', 'rotation', 'scale'] as const).map(property => [
      property,
      sampleProperty(
        object.transform[property],
        scene.keyframes.filter(
          k => k.objectId === object.id && k.property === property,
        ),
        time,
      ),
    ]),
  ) as SceneObject['transform']
}
export function transformOperations(
  scene: SceneDocument,
  id: string,
  transform: Partial<SceneObject['transform']>,
  time: number,
): Operation[] {
  const operations: Operation[] = []
  const base: Partial<SceneObject['transform']> = {}
  for (const property of ['position', 'rotation', 'scale'] as const) {
    const value = transform[property]
    if (!value) continue
    if (scene.keyframes.some(k => k.objectId === id && k.property === property))
      operations.push({
        op: 'keyframe',
        keyframe: { objectId: id, property, time, value, easing: 'linear' },
      })
    else base[property] = value
  }
  if (Object.keys(base).length)
    operations.push({ op: 'update', id, patch: { transform: base } })
  return operations
}
