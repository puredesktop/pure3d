import * as THREE from 'three'
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js'
import { extendShader } from './shaderHooks'

/**
 * Water that mirrors the scene: before each frame the scene is drawn once more from the camera's reflection in the
 * water's plane, and the water's material reads that picture (rippled by its normal map) in place of the sky's
 * reflection, so trees, rocks and the far bank appear in the pond. Lighting, fog and tone stay the material's own.
 */

type Mirror = {
  target: THREE.WebGLRenderTarget
  camera: THREE.PerspectiveCamera
  matrix: THREE.Matrix4
}

const mirrors = new WeakMap<THREE.Mesh, Mirror>()
let ripples: THREE.DataTexture | null = null

/** A seamless ripple normal map, shared by every pond (each material uses its own copy for its repeat). */
function rippleTexture(): THREE.DataTexture {
  if (ripples) return ripples
  const size = 256
  const noise = new SimplexNoise({ random: (() => { let a = 7; return () => ((a = (a * 16807) % 2147483647) / 2147483647) })() })
  const tau = Math.PI * 2
  const height = (u: number, v: number) => {
    let sum = 0, amp = 1, f = 3
    for (let i = 0; i < 4; i++) {
      const a = u * tau, b = v * tau, r = f / tau
      sum += noise.noise4d(Math.cos(a) * r, Math.sin(a) * r, Math.cos(b) * r * 0.6, Math.sin(b) * r * 0.6) * amp
      amp *= 0.5
      f *= 2
    }
    return sum
  }
  const heights = new Float32Array(size * size)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) heights[y * size + x] = height(x / size, y / size)
  const data = new Uint8Array(size * size * 4)
  const at = (x: number, y: number) => heights[((y + size) % size) * size + ((x + size) % size)]!
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 6, dy = (at(x, y + 1) - at(x, y - 1)) * 6
      const n = new THREE.Vector3(-dx, -dy, 1).normalize()
      const i = (y * size + x) * 4
      data[i] = Math.round((n.x * 0.5 + 0.5) * 255)
      data[i + 1] = Math.round((n.y * 0.5 + 0.5) * 255)
      data[i + 2] = Math.round((n.z * 0.5 + 0.5) * 255)
      data[i + 3] = 255
    }
  ripples = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  ripples.wrapS = ripples.wrapT = THREE.RepeatWrapping
  ripples.minFilter = THREE.LinearMipmapLinearFilter
  ripples.magFilter = THREE.LinearFilter
  ripples.generateMipmaps = true
  ripples.colorSpace = THREE.NoColorSpace
  ripples.needsUpdate = true
  return ripples
}

const plane = new THREE.Plane()
const normal = new THREE.Vector3()
const point = new THREE.Vector3()
const eye = new THREE.Vector3()
const look = new THREE.Vector3()
const target = new THREE.Vector3()
const rotation = new THREE.Matrix4()
const clip = new THREE.Vector4()
const q = new THREE.Vector4()
const size = new THREE.Vector2()

/** Draws the scene as seen in the water's plane into the water's mirror target. */
function renderMirror(mesh: THREE.Mesh, mirror: Mirror, renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  // only for the real frame: not for the depth and normal passes of the finishing effects, nor inside another mirror
  if (scene.overrideMaterial || !(camera as THREE.PerspectiveCamera).isPerspectiveCamera || camera === mirror.camera) return
  const surface = (mesh.geometry.userData.water as { level: number } | undefined)?.level ?? 0
  point.set(0, surface, 0).applyMatrix4(mesh.matrixWorld)
  rotation.extractRotation(mesh.matrixWorld)
  normal.set(0, 1, 0).applyMatrix4(rotation).normalize()
  eye.setFromMatrixPosition(camera.matrixWorld)
  // seen from below, a pond mirrors nothing
  if (point.clone().sub(eye).dot(normal) > 0) return
  const view = point.clone().sub(eye).reflect(normal).negate().add(point)
  rotation.extractRotation(camera.matrixWorld)
  look.set(0, 0, -1).applyMatrix4(rotation).add(eye)
  target.subVectors(point, look).reflect(normal).negate().add(point)
  const virtual = mirror.camera
  virtual.position.copy(view)
  virtual.up.set(0, 1, 0).applyMatrix4(rotation).reflect(normal)
  virtual.lookAt(target)
  virtual.far = (camera as THREE.PerspectiveCamera).far
  virtual.near = (camera as THREE.PerspectiveCamera).near
  virtual.updateMatrixWorld()
  virtual.projectionMatrix.copy(camera.projectionMatrix)
  mirror.matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
  mirror.matrix.multiply(virtual.projectionMatrix).multiply(virtual.matrixWorldInverse)
  // clip everything below the water out of the mirror view (an oblique near plane)
  plane.setFromNormalAndCoplanarPoint(normal, point).applyMatrix4(virtual.matrixWorldInverse)
  clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant)
  const p = virtual.projectionMatrix.elements
  q.set((Math.sign(clip.x) + p[8]!) / p[0]!, (Math.sign(clip.y) + p[9]!) / p[5]!, -1, (1 + p[10]!) / p[14]!)
  clip.multiplyScalar(2 / clip.dot(q))
  p[2] = clip.x
  p[6] = clip.y
  p[10] = clip.z + 1 - 0.003
  p[14] = clip.w
  // half the frame's size: the ripples blur it anyway
  renderer.getDrawingBufferSize(size)
  const width = Math.max(1, Math.round(size.x / 2)), height = Math.max(1, Math.round(size.y / 2))
  if (mirror.target.width !== width || mirror.target.height !== height) mirror.target.setSize(width, height)
  const previous = renderer.getRenderTarget()
  const shadows = renderer.shadowMap.autoUpdate
  const xr = renderer.xr.enabled
  mesh.visible = false
  renderer.xr.enabled = false
  renderer.shadowMap.autoUpdate = false
  renderer.setRenderTarget(mirror.target)
  renderer.state.buffers.depth.setMask(true)
  if (!renderer.autoClear) renderer.clear()
  renderer.render(scene, virtual)
  renderer.setRenderTarget(previous)
  renderer.shadowMap.autoUpdate = shadows
  renderer.xr.enabled = xr
  mesh.visible = true
}

/**
 * Makes a water mesh's material mirror the scene, with ripples sized to the pond. waves: the water's wave height in
 * metres (stronger ripples, more broken reflections). Called whenever the mesh gets a new material.
 */
export function dressWater(mesh: THREE.Mesh, material: THREE.MeshStandardMaterial) {
  const water = mesh.geometry.userData.water as { width: number; depth: number; waves: number }
  let mirror = mirrors.get(mesh)
  if (!mirror) {
    mirror = {
      target: new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }),
      camera: new THREE.PerspectiveCamera(),
      matrix: new THREE.Matrix4(),
    }
    mirrors.set(mesh, mirror)
  }
  const map = rippleTexture().clone()
  map.repeat.set(water.width / 3, water.depth / 3)
  map.needsUpdate = true
  material.normalMap = map
  const strength = 0.12 + Math.min(1, water.waves * 4) * 0.4
  material.normalScale.set(strength, strength)
  const uniforms = {
    p3dMirror: { value: mirror.target.texture },
    p3dMirrorMatrix: { value: mirror.matrix },
    p3dMirrorDistort: { value: 0.012 + Math.min(1, water.waves * 4) * 0.04 },
  }
  extendShader(material, 'water', shader => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 p3dMirrorMatrix;\nvarying vec4 p3dMirrorCoord;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\np3dMirrorCoord = p3dMirrorMatrix * modelMatrix * vec4(transformed, 1.0);')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D p3dMirror;\nuniform float p3dMirrorDistort;\nvarying vec4 p3dMirrorCoord;')
      .replace(
        '#include <lights_fragment_maps>',
        `#include <lights_fragment_maps>
        {
          vec2 mirrorUv = p3dMirrorCoord.xy / p3dMirrorCoord.w + (normal.xy - nonPerturbedNormal.xy) * p3dMirrorDistort * 4.0;
          radiance = texture2D(p3dMirror, clamp(mirrorUv, 0.001, 0.999)).rgb;
        }`,
      )
  })
  mesh.onBeforeRender = (renderer, scene, camera) => renderMirror(mesh, mirror!, renderer, scene, camera)
}

/** Frees a water mesh's mirror. */
export function disposeWater(mesh: THREE.Mesh) {
  const mirror = mirrors.get(mesh)
  if (!mirror) return
  mirror.target.dispose()
  mirrors.delete(mesh)
}
