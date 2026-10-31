import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { applyOperations, emptyScene, makeObject, parseScene, resolveMaterial } from './scene'
import { generatedNode } from './generators'
import { generatorParams } from './generatorSpecs.mjs'
import { LIGHT_SCALE, lightObject, removeLightMarkers, setLightMarkers } from './lights'
import { createSceneReconciler, updatePose } from './threeScene'
import { DEFAULT_LOOK, horizonColor, NightSky, resolveLook } from './look'
import { aspectRatio, blockers, frameShot, shotDirection } from './shots'
import { lookSchema, toolDefinitions } from './schemas.mjs'
import type { SceneObject } from '../types'

const object = (kind: SceneObject['kind'], params: Record<string, number | string> = {}, id: string = kind): SceneObject => ({
  ...makeObject(kind, kind),
  id,
  params: { ...generatorParams(kind), ...params },
})
const lightIn = (group: THREE.Object3D) => group.children.find(child => (child as THREE.Light).isLight) as THREE.Light
const markers = (root: THREE.Object3D) => {
  const found: THREE.Object3D[] = []
  root.traverse(node => node.userData.helper && found.push(node))
  return found
}

describe('Lights', () => {
  it('makes point, spot and area lights scaled so intensity 1 is a lamp a few metres away', () => {
    const point = lightIn(lightObject(object('light', { type: 'point', intensity: 2 })))
    const spot = lightIn(lightObject(object('light', { type: 'spot', angle: 30, softness: 0.5 })))
    const area = lightIn(lightObject(object('light', { type: 'area', width: 2, height: 0.5 })))
    expect(point).toBeInstanceOf(THREE.PointLight)
    expect(point.intensity).toBe(2 * LIGHT_SCALE.point)
    expect(point.castShadow).toBe(true)
    expect(spot).toBeInstanceOf(THREE.SpotLight)
    expect((spot as THREE.SpotLight).angle).toBeCloseTo(Math.PI / 6)
    expect((spot as THREE.SpotLight).penumbra).toBe(0.5)
    expect(area).toBeInstanceOf(THREE.RectAreaLight)
    expect((area as THREE.RectAreaLight).width).toBe(2)
    expect(area.castShadow).toBe(false)
  })
  it('shines spots and areas down by default and at a world target when aimed', () => {
    const scene = emptyScene()
    const down = { ...object('light', { type: 'spot' }, 'down'), transform: { position: [0, 3, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1, 1, 1] as [number, number, number] } }
    const aimed = { ...object('light', { type: 'spot', aim: 'target', targetX: 4, targetY: 0, targetZ: 0 }, 'aimed'), transform: { ...down.transform } }
    const panel = { ...object('light', { type: 'area', aim: 'target', targetX: 0, targetY: 3, targetZ: -5 }, 'panel'), transform: { ...down.transform } }
    scene.objects.push(down, aimed, panel)
    const built = createSceneReconciler(scene)
    updatePose(scene, built.objects, 0)
    built.root.updateMatrixWorld(true)
    const direction = (light: THREE.SpotLight) => light.target.getWorldPosition(new THREE.Vector3()).sub(light.getWorldPosition(new THREE.Vector3())).normalize()
    expect(direction(lightIn(built.objects.get('down')!) as THREE.SpotLight).toArray().map(n => Math.round(n * 1000) / 1000)).toEqual([0, -1, 0])
    const towards = direction(lightIn(built.objects.get('aimed')!) as THREE.SpotLight)
    expect(towards.x).toBeGreaterThan(0.7)
    const area = lightIn(built.objects.get('panel')!)
    const facing = new THREE.Vector3(0, 0, -1).applyQuaternion(area.getWorldQuaternion(new THREE.Quaternion()))
    expect(facing.z).toBeLessThan(-0.99)
    built.dispose()
  })
  it('keeps light markers out of renders and exports, and rebuilds a light when its params change', () => {
    const scene = emptyScene()
    scene.objects.push(object('light', { type: 'area' }, 'key'))
    const built = createSceneReconciler(scene)
    expect(markers(built.root)).toHaveLength(1)
    setLightMarkers(built.root, false)
    expect(markers(built.root).every(node => !node.visible)).toBe(true)
    const before = built.objects.get('key')
    const next = applyOperations(scene, [{ op: 'update', id: 'key', patch: { params: { type: 'point' } } }])
    built.reconcile(next)
    expect(built.objects.get('key')).not.toBe(before)
    expect(lightIn(built.objects.get('key')!)).toBeInstanceOf(THREE.PointLight)
    removeLightMarkers(built.root)
    expect(markers(built.root)).toHaveLength(0)
    built.dispose()
  })
  it('lets a lantern light its surroundings without shadowing its own glass', () => {
    const dark = generatedNode(object('lantern'), null)
    const lit = generatedNode(object('lantern', { light: 1.5 }), null)
    expect(dark.children).toHaveLength(0)
    const light = lit.children[0] as THREE.PointLight
    expect(light).toBeInstanceOf(THREE.PointLight)
    expect(light.castShadow).toBe(false)
  })
  it('validates light params and shows only the ones that apply', () => {
    expect(() => parseScene({ ...emptyScene(), objects: [object('light', { type: 'laser' })] })).toThrow(/type must be one of point, spot, area/)
    const angle = (generatorParams as unknown as (kind: string) => Record<string, unknown>)('light')
    expect(angle.type).toBe('point')
  })
})

describe('Studio backdrop', () => {
  it('sweeps a floor up into a back wall as one smooth sheet', () => {
    const geometry = generatedNode(object('backdrop', { width: 6, depth: 5, height: 3, radius: 1 }), null).geometry
    geometry.computeBoundingBox()
    const box = geometry.boundingBox!
    expect(box.min.x).toBeCloseTo(-3)
    expect(box.max.x).toBeCloseTo(3)
    expect(box.min.y).toBeCloseTo(0)
    expect(box.max.y).toBeCloseTo(3)
    expect(box.min.z).toBeCloseTo(-2.5)
    expect(box.max.z).toBeCloseTo(2.5)
    // normals turn smoothly from up (floor) to forward (wall): none points sideways or down
    const normal = geometry.getAttribute('normal')
    for (let i = 0; i < normal.count; i++) {
      expect(normal.getY(i) + normal.getZ(i)).toBeGreaterThan(0.9)
      expect(Math.abs(normal.getX(i))).toBeLessThan(1e-3)
    }
  })
})

describe('Material presets', () => {
  it('fills in a real material under the object’s own values', () => {
    const scene = emptyScene()
    const ring = { ...makeObject('torus', 'Ring'), material: { preset: 'gold' as const } }
    const tinted = { ...makeObject('sphere', 'Tinted'), material: { preset: 'glass' as const, color: '#cce8ff' } }
    scene.objects.push(ring, tinted)
    expect(resolveMaterial(scene, ring)).toMatchObject({ metalness: 1, roughness: 0.22, color: '#e6b84f', transmission: 0 })
    expect(resolveMaterial(scene, tinted)).toMatchObject({ transmission: 1, color: '#cce8ff' })
    expect(resolveMaterial(scene, ring)).not.toHaveProperty('preset')
  })
  it('replaces the older values a preset sets when an update chooses it', () => {
    const scene = emptyScene()
    const cup = { ...makeObject('cylinder', 'Cup'), material: { color: '#ff0000', metalness: 0.2, roughness: 0.5, opacity: 0.8 } }
    scene.objects.push(cup)
    const next = applyOperations(scene, [{ op: 'update', id: cup.id, patch: { material: { preset: 'porcelain' } } }])
    const updated = next.objects[0]!
    expect(updated.material).toEqual({ preset: 'porcelain', opacity: 0.8 })
    expect(resolveMaterial(next, updated)).toMatchObject({ color: '#fbfaf7', clearcoat: 1 })
    const kept = applyOperations(scene, [{ op: 'update', id: cup.id, patch: { material: { preset: 'velvet', color: '#204060' } } }])
    expect(resolveMaterial(kept, kept.objects[0]!)).toMatchObject({ color: '#204060', sheen: 1 })
  })
})

describe('Night', () => {
  it('takes a night sky with stars, and dims the horizon for fog', () => {
    expect(lookSchema.parse({ environment: 'night', stars: 0.8 })).toEqual({ environment: 'night', stars: 0.8 })
    const scene = emptyScene()
    scene.settings.look = { environment: 'night' }
    const look = resolveLook(scene)
    expect(look.stars).toBe(DEFAULT_LOOK.stars)
    expect(horizonColor(look, '#ffffff').getHSL({ h: 0, s: 0, l: 0 }).l).toBeLessThan(0.2)
  })
  it('shows the moon only while it is up', () => {
    const sky = new NightSky()
    sky.set(new THREE.Vector3(0, 0.5, 0.8).normalize(), 0.6, 0.2)
    expect(sky.material.uniforms.moon.value).toBe(1)
    sky.set(new THREE.Vector3(0, -0.3, 0.9).normalize(), 0.6, 0.2)
    expect(sky.material.uniforms.moon.value).toBe(0)
    sky.dispose()
  })
})

describe('Shots', () => {
  it('frames a subject from a direction so it fills the asked share of the frame', () => {
    const subject = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 1)
    const shot = frameShot({ azimuth: 90, elevation: 0, fill: 1 }, subject, 16 / 9, 40)
    expect(shot.target).toEqual([0, 1, 0])
    expect(shot.position[1]).toBeCloseTo(1)
    expect(shot.position[2]).toBeCloseTo(0)
    expect(shot.position[0]).toBeCloseTo(1 / Math.sin(THREE.MathUtils.degToRad(20)), 2)
    // a tall frame is limited by its width, so the camera stands further back
    const tall = frameShot({ azimuth: 90, elevation: 0, fill: 1 }, subject, 9 / 16, 40)
    expect(tall.position[0]).toBeGreaterThan(shot.position[0])
    expect(frameShot({ distance: 10, azimuth: 0, elevation: 0 }, subject, 1).position).toEqual([0, 1, 10])
  })
  it('names what stands between the camera and the subject', () => {
    const scene = emptyScene()
    const subject = { ...makeObject('sphere', 'Subject'), id: 'subject' }
    const wall = { ...makeObject('box', 'Wall'), id: 'wall', transform: { position: [0, 0, 4] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [3, 3, 0.2] as [number, number, number] } }
    const aside = { ...makeObject('box', 'Aside'), id: 'aside', transform: { position: [6, 0, 4] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1, 1, 1] as [number, number, number] } }
    scene.objects.push(subject, wall, aside)
    const built = createSceneReconciler(scene)
    built.root.updateMatrixWorld(true)
    const shot = { position: [0, 0, 10] as [number, number, number], target: [0, 0, 0] as [number, number, number], fov: 40 }
    expect(blockers(built.root, shot, 0.5, new Set(['subject']))).toEqual(['wall'])
    built.objects.get('wall')!.visible = false
    expect(blockers(built.root, shot, 0.5, new Set(['subject']))).toEqual([])
    built.dispose()
  })
  it('keeps an explicit camera, and reads aspects and directions', () => {
    expect(frameShot({ position: [1, 2, 3], target: [0, 0, 0], fov: 30 }, new THREE.Sphere(), 1)).toEqual({ position: [1, 2, 3], target: [0, 0, 0], fov: 30 })
    expect(aspectRatio('4:5')).toBe(0.8)
    expect(shotDirection(0, 0).toArray().map(n => Math.round(n))).toEqual([0, 0, 1])
  })
  it('accepts capture options and shots in the tool schemas', () => {
    expect(toolDefinitions.captureViewport.schema.parse({ aspect: '4:5', size: 1600, views: [{ objectIds: ['a'], azimuth: 30, elevation: 15 }] })).toBeTruthy()
    expect(() => toolDefinitions.captureViewport.schema.parse({ views: [{ position: [1, 1, 1] }] })).toThrow()
    expect(() => toolDefinitions.setWorkspace.schema.parse({ shotAt: 2 })).toThrow()
  })
})
