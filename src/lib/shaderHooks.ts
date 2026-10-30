import type * as THREE from 'three'

type Shader = Parameters<THREE.Material['onBeforeCompile']>[0]

/**
 * Adds an edit to a material's shader, after any edits it already has (a tree's bark surface and its leaves' glow,
 * say), and names the program after all of them so materials with the same edits share one.
 */
export function extendShader(material: THREE.Material, key: string, edit: (shader: Shader) => void) {
  const previous = material.onBeforeCompile
  const keys: string[] = (material.userData.shaderKeys ??= [])
  keys.push(key)
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer)
    edit(shader)
  }
  material.customProgramCacheKey = () => `pure3d:${keys.join('+')}`
  material.needsUpdate = true
}
