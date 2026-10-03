import * as THREE from 'three'
import { pose, resolveMaterial, sampleProperty } from './scene'
import { createGeometry } from './geometry'
import { loadTexture, TextureAssetCache } from './textures'
import type { SceneDocument, SceneObject, Vec3 } from '../types'

export interface BuiltScene {
  root: THREE.Group
  objects: Map<string, THREE.Object3D>
  ready: Promise<void>
}

type ReconciledScene = BuiltScene & {
  reconcile: (document: SceneDocument, time?: number) => void
  dispose: () => void
}

function disposeNode(node: THREE.Object3D) {
  if (!(node instanceof THREE.Mesh)) return
  node.geometry.dispose()
  const materials = Array.isArray(node.material) ? node.material : [node.material]
  for (const material of materials) {
    // Texture wrappers are per material. Their decoded source belongs to the cache.
    for (const value of Object.values(material))
      if (value instanceof THREE.Texture) value.dispose()
    material.dispose()
  }
}

/** Incrementally projects immutable scene snapshots into a stable Three.js tree. */
export function createSceneReconciler(
  initial: SceneDocument,
  time = 0,
): ReconciledScene {
  const root = new THREE.Group()
  const objects = new Map<string, THREE.Object3D>()
  const cache = new TextureAssetCache()
  const objectSignatures = new Map<string, string>()
  const materialSignatures = new Map<string, string>()
  const textureLoads = new Map<string, Promise<void>>()
  const objectImages = new Map<string, string | undefined>()
  let ready: Promise<void> = Promise.resolve()
  const result: ReconciledScene = {
    root,
    objects,
    get ready() {
      return ready
    },
    reconcile,
    dispose() {
      for (const node of objects.values()) disposeNode(node)
      objects.clear()
      textureLoads.clear()
      cache.dispose()
      root.clear()
    },
  }
  function reconcile(document: SceneDocument, poseTime = 0) {
    root.name = document.title
    const next = new Map(document.objects.map(object => [object.id, object]))
    for (const [id, node] of objects)
      if (!next.has(id)) {
        node.removeFromParent()
        disposeNode(node)
        objects.delete(id)
        objectSignatures.delete(id)
        materialSignatures.delete(id)
        textureLoads.delete(id)
        objectImages.delete(id)
      }
    const usedAssets = new Map<string, SceneDocument['textureAssets'][number]>()
    const assets = new Map(document.textureAssets.map(asset => [asset.id, asset]))
    for (const object of document.objects) {
      const geometrySignature = JSON.stringify({ kind: object.kind, geometry: object.geometry })
      let node = objects.get(object.id)
      const needsGroup = object.kind === 'group'
      if (!node || (needsGroup ? !(node instanceof THREE.Group) || node instanceof THREE.Mesh : !(node instanceof THREE.Mesh))) {
        if (node) {
          node.removeFromParent()
          disposeNode(node)
        }
        node = needsGroup
          ? new THREE.Group()
          : new THREE.Mesh(createGeometry(object), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }))
        objects.set(object.id, node)
        objectSignatures.set(object.id, geometrySignature)
        materialSignatures.delete(object.id)
        textureLoads.delete(object.id)
        objectImages.delete(object.id)
      }
      node.name = object.id
      node.userData = { pure3dId: object.id, label: object.name }
      node.visible = object.visible
      if (node instanceof THREE.Mesh && objectSignatures.get(object.id) !== geometrySignature) {
        node.geometry.dispose()
        node.geometry = createGeometry(object)
        objectSignatures.set(object.id, geometrySignature)
      }
      if (node instanceof THREE.Mesh) {
        const resolved = resolveMaterial(document, object)
        const asset = resolved.texture ? assets.get(resolved.texture.assetId) : undefined
        if (asset) usedAssets.set(asset.id, asset)
        const signature = JSON.stringify(resolved)
        if (materialSignatures.get(object.id) !== signature || objectImages.get(object.id) !== asset?.dataUrl) {
          textureLoads.delete(object.id)
          disposeNodeMaterial(node.material)
          const { texture, ...properties } = resolved
          const material = new THREE.MeshStandardMaterial({ ...properties, transparent: properties.opacity < 1, side: THREE.DoubleSide })
          if (texture) {
            if (!asset) throw new Error(`Unknown texture asset: ${texture.assetId}`)
            const loaded = cache.texture(asset, texture)
            material.map = loaded.texture
            textureLoads.set(object.id, loaded.ready)
          }
          node.material = material
          materialSignatures.set(object.id, signature)
          objectImages.set(object.id, asset?.dataUrl)
        }
      }
    }
    for (const object of document.objects) {
      const node = objects.get(object.id)!
      const parent = object.parentId ? objects.get(object.parentId)! : root
      if (node.parent !== parent) parent.add(node)
    }
    cache.retain([...usedAssets.values()])
    ready = Promise.all(textureLoads.values()).then(() => {})
    updatePose(document, objects, poseTime)
  }
  reconcile(initial, time)
  return result
}

function disposeNodeMaterial(material: THREE.Material | THREE.Material[]) {
  for (const item of Array.isArray(material) ? material : [material]) {
    for (const value of Object.values(item))
      if (value instanceof THREE.Texture) value.dispose()
    item.dispose()
  }
}
export function buildScene(document: SceneDocument, time = 0): BuiltScene {
  const root = new THREE.Group()
  root.name = document.title
  const objects = new Map<string, THREE.Object3D>()
  const pending: Promise<void>[] = []
  for (const object of document.objects) {
    const { texture, ...properties } = resolveMaterial(document, object)
    const material = new THREE.MeshStandardMaterial({
      ...properties,
      transparent: properties.opacity < 1,
      side: THREE.DoubleSide,
    })
    if (texture && object.kind !== 'group') {
      const asset = document.textureAssets.find(item => item.id === texture.assetId)
      if (!asset) throw new Error(`Unknown texture asset: ${texture.assetId}`)
      const loaded = loadTexture(asset, texture)
      material.map = loaded.texture
      pending.push(loaded.ready)
    }
    const node =
      object.kind === 'group'
        ? new THREE.Group()
        : new THREE.Mesh(createGeometry(object), material)
    if (object.kind === 'group') material.dispose()
    node.name = object.id
    node.userData = { pure3dId: object.id, label: object.name }
    node.visible = object.visible
    objects.set(object.id, node)
  }
  for (const object of document.objects)
    (object.parentId ? objects.get(object.parentId)! : root).add(
      objects.get(object.id)!,
    )
  updatePose(document, objects, time)
  return { root, objects, ready: Promise.all(pending).then(() => {}) }
}
export function updatePose(
  document: SceneDocument,
  objects: Map<string, THREE.Object3D>,
  time: number,
) {
  for (const object of document.objects) {
    const node = objects.get(object.id)
    if (!node) continue
    const transform = pose(document, object, time)
    node.position.fromArray(transform.position)
    node.rotation.set(...transform.rotation)
    node.scale.fromArray(transform.scale)
  }
}
export function disposeScene(root: THREE.Object3D) {
  root.traverse(node => {
    if (
      node instanceof THREE.Mesh ||
      node instanceof THREE.LineSegments ||
      node instanceof THREE.Points
    ) {
      node.geometry.dispose()
      const materials = Array.isArray(node.material)
        ? node.material
        : [node.material]
      for (const material of materials) {
        for (const value of Object.values(material))
          if (value instanceof THREE.Texture) {
            value.dispose()
            if (
              typeof ImageBitmap !== 'undefined' &&
              value.image instanceof ImageBitmap
            )
              value.image.close()
          }
        material.dispose()
      }
    }
  })
}
export function makeAnimation(
  document: SceneDocument,
  objects: Map<string, THREE.Object3D>,
): THREE.AnimationClip[] {
  const tracks: THREE.KeyframeTrack[] = []
  for (const object of document.objects) {
    const node = objects.get(object.id)
    if (!node) continue
    for (const property of ['position', 'rotation', 'scale'] as const) {
      const keys = document.keyframes.filter(
        k => k.objectId === object.id && k.property === property,
      )
      if (!keys.length) continue
      const times = new Set([
        0,
        document.settings.duration,
        ...keys.map(k => k.time),
      ])
      for (
        let frame = 0;
        frame <= Math.ceil(document.settings.duration * document.settings.fps);
        frame++
      )
        times.add(
          Math.min(frame / document.settings.fps, document.settings.duration),
        )
      for (const key of keys) {
        const next = keys
          .filter(k => k.time > key.time)
          .sort((a, b) => a.time - b.time)[0]
        if (key.easing === 'step' && next)
          times.add(Math.max(key.time, next.time - 0.00001))
      }
      const sorted = [...times].sort((a, b) => a - b)
      const values = sorted.flatMap(time => {
        const v = sampleProperty(object.transform[property], keys, time)
        return property === 'rotation'
          ? new THREE.Quaternion().setFromEuler(new THREE.Euler(...v)).toArray()
          : v
      })
      tracks.push(
        property === 'rotation'
          ? new THREE.QuaternionKeyframeTrack(
              `${node.uuid}.quaternion`,
              sorted,
              values,
            )
          : new THREE.VectorKeyframeTrack(
              `${node.uuid}.${property}`,
              sorted,
              values,
            ),
      )
    }
  }
  return tracks.length
    ? [
        new THREE.AnimationClip(
          'Scene animation',
          document.settings.duration,
          tracks,
        ),
      ]
    : []
}
export async function exportScene(
  document: SceneDocument,
  format: 'glb' | 'obj' | 'stl',
  time: number,
): Promise<{ data: ArrayBuffer | string; mimeType: string }> {
  const built = buildScene(document, format === 'glb' ? 0 : time)
  const visible = (node: THREE.Object3D) => {
    let current: THREE.Object3D | null = node
    while (current) {
      if (!current.visible) return false
      current = current.parent
    }
    return true
  }
  try {
    await built.ready
    for (const [id, node] of built.objects)
      if (!visible(node)) {
        built.objects.delete(id)
        node.removeFromParent()
        disposeScene(node)
      }
    built.root.updateMatrixWorld(true)
    if (format === 'obj') {
      const { OBJExporter } = await import('three/addons/exporters/OBJExporter.js')
      return {
        data: new OBJExporter().parse(built.root),
        mimeType: 'text/plain',
      }
    }
    if (format === 'stl') {
      const { STLExporter } = await import('three/addons/exporters/STLExporter.js')
      return {
        data: new STLExporter().parse(built.root),
        mimeType: 'model/stl',
      }
    }
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js')
    return {
      data: (await new GLTFExporter().parseAsync(built.root, {
        binary: true,
        animations: makeAnimation(document, built.objects),
        trs: true,
      })) as ArrayBuffer,
      mimeType: 'model/gltf-binary',
    }
  } finally {
    disposeScene(built.root)
  }
}
export function nodeTransform(node: THREE.Object3D): SceneObject['transform'] {
  return {
    position: node.position.toArray() as Vec3,
    rotation: [node.rotation.x, node.rotation.y, node.rotation.z],
    scale: node.scale.toArray() as Vec3,
  }
}
