import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { KIT_NAMES } from './kit.mjs'

/**
 * Loads kit models (public/kit/<name>.glb) once each and hands out copies that share geometry, materials and
 * textures. The shared pieces are marked so disposing a scene never frees them for the other copies.
 */

const loaded = new Map<string, Promise<THREE.Object3D>>()

function load(name: string): Promise<THREE.Object3D> {
  let model = loaded.get(name)
  if (!model) {
    model = (async () => {
      if (!KIT_NAMES.includes(name)) throw new Error(`No kit model named "${name}"`)
      const response = await fetch(new URL(`kit/${name}.glb`, document.baseURI))
      if (!response.ok) throw new Error(`Could not load kit model ${name} (${response.status})`)
      const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '')
      gltf.scene.traverse(node => {
        const mesh = node as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.castShadow = true
        mesh.receiveShadow = true
        mesh.geometry.userData.shared = true
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          material.userData.shared = true
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.userData.shared = true
        }
      })
      return gltf.scene
    })()
    // a failed load can be tried again later
    model.catch(() => loaded.delete(name))
    loaded.set(name, model)
  }
  return model
}

/**
 * A group that fills with a copy of the named kit model once it has loaded. ready settles either way: a model that
 * cannot load leaves the group empty and says why in its userData.
 */
export function kitNode(name: string): { node: THREE.Group; ready: Promise<void> } {
  const node = new THREE.Group()
  const ready = (typeof document === 'undefined' ? Promise.reject(new Error('Kit models need a browser')) : load(name)).then(
    model => {
      node.add(model.clone(true))
    },
    (error: unknown) => {
      node.userData.kitError = error instanceof Error ? error.message : String(error)
    },
  )
  return { node, ready }
}
