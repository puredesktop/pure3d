import * as THREE from 'three'
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js'
import { generatorParams } from './generatorSpecs.mjs'
import type { SceneObject } from '../types'

let areaLightsReady = false
/** Area lights need their lookup tables uploaded once before the first one is drawn. */
function prepareAreaLights() {
  if (areaLightsReady) return
  RectAreaLightUniformsLib.init()
  areaLightsReady = true
}

/**
 * How bright intensity 1 is for each type, so 1 always reads as "a normal lamp a few metres away" (about as bright as
 * the default sun on what it lights at 3 m): a point or spot light in candela, an area panel in nits for a 1 m² panel.
 * An area panel's brightness is spread over its size, so a bigger softbox is softer, not brighter.
 */
export const LIGHT_SCALE = { point: 8, spot: 9, area: 9 } as const
export type LightType = keyof typeof LIGHT_SCALE

/** What a light's own pieces (the light, its target, its marker) carry, so they are told apart from scene objects. */
type PartData = { pure3dPart: true; helper?: true; aim?: THREE.Vector3 | null }
const part = (node: THREE.Object3D, extra: Partial<PartData> = {}) => {
  node.userData = { pure3dPart: true, ...extra }
  return node
}

/** A small marker that shows where a light is while editing; renders and camera previews leave it out. */
function marker(type: LightType, color: THREE.Color, width: number, height: number): THREE.Mesh {
  const geometry = type === 'area' ? new THREE.PlaneGeometry(width, height) : new THREE.SphereGeometry(0.06, 12, 8)
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, toneMapped: false, fog: false }))
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.name = 'Pure3D light marker'
  part(mesh, { helper: true })
  return mesh
}

function shadowed(light: THREE.PointLight | THREE.SpotLight, range: number) {
  light.castShadow = true
  light.shadow.mapSize.set(1024, 1024)
  light.shadow.bias = -0.0004
  light.shadow.normalBias = 0.02
  light.shadow.camera.near = 0.05
  light.shadow.camera.far = range > 0 ? range : 200
}

/**
 * A light object's node: a group holding the light (point, spot or area) and its editing marker. A spot or area shines
 * along the object's local -y unless it aims at a target, which aimLights keeps pointed at as the light moves.
 */
export function lightObject(object: SceneObject): THREE.Group {
  const params = generatorParams('light', object.params)
  const type = params.type as LightType
  const color = new THREE.Color(String(params.color))
  const intensity = Number(params.intensity) * LIGHT_SCALE[type]
  const range = Number(params.range)
  const aim = params.aim === 'target' ? new THREE.Vector3(Number(params.targetX), Number(params.targetY), Number(params.targetZ)) : null
  const group = new THREE.Group()
  let light: THREE.Light
  if (type === 'area') {
    prepareAreaLights()
    const width = Number(params.width), height = Number(params.height)
    const area = new THREE.RectAreaLight(color, intensity / (width * height), width, height)
    // an area light shines along its -z; turned so it shines down -y like a spot
    area.rotation.x = -Math.PI / 2
    area.add(marker(type, color, width, height))
    light = area
  } else if (type === 'spot') {
    const spot = new THREE.SpotLight(color, intensity, range, THREE.MathUtils.degToRad(Number(params.angle)), Number(params.softness), 2)
    spot.target.position.set(0, -1, 0)
    part(spot.target)
    spot.add(spot.target)
    if (params.shadows === 'yes') shadowed(spot, range)
    spot.add(marker(type, color, 0, 0))
    light = spot
  } else {
    const point = new THREE.PointLight(color, intensity, range, 2)
    if (params.shadows === 'yes') shadowed(point, range)
    point.add(marker(type, color, 0, 0))
    light = point
  }
  light.name = `Pure3D ${type} light`
  part(light, { aim })
  group.add(light)
  return group
}

/** A lantern's own warm light, inside its glass; it casts no shadow (the glass round it would block it). */
export function lanternLight(height: number, amount: number): THREE.PointLight {
  const light = new THREE.PointLight('#ffb35c', amount * LIGHT_SCALE.point * 0.6, 0, 2)
  light.position.set(0, height * 0.48, 0)
  light.name = 'Pure3D lantern light'
  part(light)
  return light
}

/** Points every aimed light at its target in world space; call once objects are posed. */
export function aimLights(nodes: Iterable<THREE.Object3D>) {
  const target = new THREE.Vector3()
  for (const node of nodes)
    for (const child of node.children) {
      const aim = (child.userData as Partial<PartData>).aim
      if (!aim || !(child as THREE.Light).isLight) continue
      node.updateWorldMatrix(true, true)
      target.copy(aim)
      if (child instanceof THREE.SpotLight) {
        child.target.position.copy(child.worldToLocal(target.clone()))
        child.target.updateMatrixWorld()
      } else if (child instanceof THREE.RectAreaLight) {
        child.lookAt(target)
        child.updateMatrixWorld()
      }
    }
}

/** Shows or hides every light marker under a node: shown while editing, hidden in renders and camera previews. */
export function setLightMarkers(root: THREE.Object3D, visible: boolean) {
  root.traverse(node => {
    if ((node.userData as Partial<PartData>).helper) node.visible = visible
  })
}

/** Removes light markers (export keeps lights, which GLB carries, but not the markers). */
export function removeLightMarkers(root: THREE.Object3D) {
  const markers: THREE.Object3D[] = []
  root.traverse(node => {
    if ((node.userData as Partial<PartData>).helper) markers.push(node)
  })
  for (const node of markers) {
    node.removeFromParent()
    disposePart(node)
  }
}

function disposePart(node: THREE.Object3D) {
  if (node instanceof THREE.Mesh) {
    node.geometry.dispose()
    ;(node.material as THREE.Material).dispose()
  }
  if ((node as THREE.Light).isLight) (node as THREE.Light).dispose()
}

/** Frees a node's own light pieces (lights, shadow maps, markers), leaving child scene objects alone. */
export function disposeLightParts(node: THREE.Object3D) {
  for (const child of node.children)
    if ((child.userData as Partial<PartData>).pure3dPart) child.traverse(disposePart)
}
