import * as THREE from 'three'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { makeObject } from './scene'
import { nodeTransform, disposeScene } from './threeScene'
import { objectSchema } from './schemas.mjs'
import { textureFromMap } from './textures'
import type { SceneDocument, SceneObject } from '../types'

export type ImportedModel = SceneObject[] & {
  textureAssets: SceneDocument['textureAssets']
}

export function assertSelfContainedGLB(data: ArrayBuffer) {
  const view = new DataView(data)
  if (
    view.byteLength < 20 ||
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== data.byteLength ||
    view.getUint32(16, true) !== 0x4e4f534a
  )
    throw new Error('Invalid GLB version 2 file')
  const length = view.getUint32(12, true)
  if (20 + length > data.byteLength) throw new Error('Truncated GLB JSON chunk')
  const json = JSON.parse(
    new TextDecoder().decode(new Uint8Array(data, 20, length)),
  )
  for (const resource of [...(json.buffers ?? []), ...(json.images ?? [])])
    if (resource.uri && !resource.uri.startsWith('data:'))
      throw new Error(
        'GLB must be self-contained; external resource URLs are unsupported',
      )
  if (
    json.skins?.length ||
    json.animations?.length ||
    json.meshes?.some((m: { primitives: { targets?: unknown[] }[] }) =>
      m.primitives.some(p => p.targets?.length),
    )
  )
    throw new Error(
      'Import supports static GLB geometry. Rigs, morphs and existing animation clips are unsupported.',
    )
}
export function objectsFromModel(
  root: THREE.Object3D,
  label: string,
): ImportedModel {
  const objects = [] as unknown as ImportedModel
  const assets = new Map<
    THREE.Texture,
    { asset: SceneDocument['textureAssets'][number]; binding: ReturnType<typeof textureFromMap>['binding'] }
  >()
  Object.defineProperty(objects, 'textureAssets', { value: [], enumerable: false })
  const visit = (node: THREE.Object3D, parentId: string | null) => {
    if (
      node instanceof THREE.SkinnedMesh ||
      node instanceof THREE.Line ||
      node instanceof THREE.Points
    )
      throw new Error('Only triangle meshes and groups can be imported')
    const object = makeObject('group', node.name || label)
    object.parentId = parentId
    object.visible = node.visible
    object.transform = nodeTransform(node)
    objects.push(object)
    if (node instanceof THREE.Mesh) {
      const materials: THREE.Material[] = Array.isArray(node.material)
        ? node.material
        : [node.material]
      if (
        materials.some(m =>
          Object.entries(m).some(
            ([key, value]) => value instanceof THREE.Texture && key !== 'map',
          ),
        )
      )
        throw new Error('Only base-color texture maps can be imported')
      const source = node.geometry as THREE.BufferGeometry
      const geometries =
        materials.length > 1
          ? source.groups.map(group => ({
              start: group.start,
              count: group.count,
              material: materials[group.materialIndex ?? 0],
            }))
          : [
              {
                start: 0,
                count:
                  source.index?.count ?? source.getAttribute('position').count,
                material: materials[0],
              },
            ]
      for (const group of geometries) {
        const mesh = makeObject(
          'group',
          materials.length > 1
            ? `${object.name} part ${objects.length}`
            : object.name,
        )
        const positions = source.getAttribute('position')
        const vertices: number[] = []
        const sourceUV = source.getAttribute('uv')
        const uv: number[] = []
        for (let i = group.start; i < group.start + group.count; i++) {
          const index = source.index ? source.index.getX(i) : i
          vertices.push(
            positions.getX(index),
            positions.getY(index),
            positions.getZ(index),
          )
          if (sourceUV) uv.push(sourceUV.getX(index), sourceUV.getY(index))
        }
        mesh.kind = 'mesh'
        mesh.geometry = {
          positions: vertices,
          indices: null,
          ...(sourceUV ? { uv } : {}),
        }
        mesh.parentId = object.id
        const mat = group.material as THREE.MeshStandardMaterial
        const imported = mat.map
          ? assets.get(mat.map) ?? (() => {
              const texture = textureFromMap(mat.map!)
              const asset = { id: crypto.randomUUID(), dataUrl: texture.dataUrl }
              const entry = { asset, binding: texture.binding }
              assets.set(mat.map!, entry)
              objects.textureAssets.push(asset)
              return entry
            })()
          : null
        mesh.material = {
          color: mat.color ? `#${mat.color.getHexString()}` : '#7b9dcc',
          metalness: mat.metalness ?? 0,
          roughness: mat.roughness ?? 0.5,
          opacity: mat.opacity ?? 1,
          wireframe: false,
          ...(imported ? { texture: { assetId: imported.asset.id, ...imported.binding } } : {}),
        }
        objects.push(objectSchema.parse(mesh))
      }
    }
    node.children.forEach(child => visit(child, object.id))
  }
  visit(root, null)
  if (!objects.some(o => o.kind === 'mesh'))
    throw new Error('The file has no triangle meshes')
  return objects
}
export async function importModel(
  data: ArrayBuffer | string,
  extension: string,
  label = 'Imported model',
): Promise<ImportedModel> {
  let root: THREE.Object3D
  let textures: Promise<unknown[]> | undefined
  if (extension === 'obj' && typeof data === 'string')
    root = new OBJLoader().parse(data)
  else if (extension === 'stl' && data instanceof ArrayBuffer)
    root = new THREE.Mesh(
      new STLLoader().parse(data),
      new THREE.MeshStandardMaterial(),
    )
  else if (extension === 'glb' && data instanceof ArrayBuffer) {
    assertSelfContainedGLB(data)
    const loaded = await new GLTFLoader().parseAsync(data, '')
    root = loaded.scene
    textures = loaded.parser.getDependencies('texture')
  } else throw new Error('Choose an OBJ, STL or static self-contained GLB file')
  try {
    if (textures && (await textures).some(texture => !texture))
      throw new Error(
        'A GLB texture could not be decoded; the model was not imported',
      )
    return objectsFromModel(root, label)
  } finally {
    disposeScene(root)
  }
}
