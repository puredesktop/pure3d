import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { applyOperations, emptyScene, makeObject, parseScene, resolveMaterial } from './scene'
import { generatedNode, terrainField } from './generators'
import { generatorParams, GENERATOR_KINDS } from './generatorSpecs.mjs'
import { createSceneReconciler } from './threeScene'
import { DEFAULT_LOOK, resolveLook, sunDirection } from './look'
import type { SceneObject } from '../types'

const object = (kind: SceneObject['kind'], params: Record<string, number | string> = {}, id: string = kind): SceneObject => ({
  ...makeObject(kind, kind),
  id,
  params: { ...generatorParams(kind), ...params },
})

describe('Generated objects', () => {
  it('saves parameters, not triangles, and refuses parameters a generator does not have', () => {
    const scene = emptyScene()
    scene.objects = [object('terrain')]
    expect(parseScene(scene).objects[0]!.geometry).toBeNull()
    scene.objects = [object('terrain', { colour: '#ffffff' })]
    expect(() => parseScene(scene)).toThrow(/Terrain has no parameter/)
    scene.objects = [object('scatter', { item: 'palm' })]
    expect(() => parseScene(scene)).toThrow(/item must be one of/)
    scene.objects = [{ ...makeObject('box'), params: { seed: 1 } }]
    expect(() => parseScene(scene)).toThrow(/box objects take no params/)
  })
  it('merges a parameter patch and keeps the rest', () => {
    const scene = emptyScene()
    scene.objects = [object('tree', { height: 5 })]
    const next = applyOperations(scene, [{ op: 'update', id: 'tree', patch: { params: { style: 'birch' } } }])
    expect(next.objects[0]!.params).toMatchObject({ style: 'birch', height: 5 })
  })
  it('makes the same shape from the same seed, a flat clearing, and white matte defaults that vertex colours tint', () => {
    const a = terrainField({ seed: 3, clearing: 8, height: 6 }), b = terrainField({ seed: 3, clearing: 8, height: 6 })
    expect(a(20, -11)).toBe(b(20, -11))
    expect(a(2, 3)).toBeCloseTo(a(0, 0), 6)
    expect(terrainField({ seed: 4, height: 6 })(20, -11)).not.toBe(a(20, -11))
    const scene = emptyScene()
    scene.objects = [object('rock')]
    expect(resolveMaterial(scene, scene.objects[0]!)).toMatchObject({ color: '#ffffff', metalness: 0 })
  })
  it('builds every generator with colours and UVs, leaf cards on foliage', () => {
    for (const kind of GENERATOR_KINDS) {
      const node = generatedNode(object(kind, kind === 'scatter' ? { count: 20 } : {}), null)
      expect(node.geometry.getAttribute('position').count).toBeGreaterThan(0)
      expect(node.geometry.getAttribute('uv')).toBeTruthy()
      if (kind !== 'roundedBox') expect(node.geometry.hasAttribute('color')).toBe(true)
    }
    expect(generatedNode(object('tree', { style: 'pine' }), null).geometry.userData.leafAtlas).toBe(true)
    expect(generatedNode(object('scatter', { item: 'rock', count: 5 }), null).geometry.userData.leafAtlas).toBe(false)
  })
  it('scatters instances over a terrain at its height, and keeps a clearing empty', () => {
    const scene = emptyScene()
    const ground = object('terrain', { width: 40, depth: 40, height: 8, seed: 2 }, 'ground')
    ground.transform.position = [0, 3, 0]
    const trees = object('scatter', { item: 'rock', count: 60, width: 30, depth: 30, on: 'ground', avoid: 6, maxSlope: 90 }, 'rocks')
    scene.objects = [ground, trees]
    const node = generatedNode(trees, parseScene(scene)) as THREE.InstancedMesh
    expect(node.count).toBe(60)
    const field = terrainField(ground.params!)
    const m = new THREE.Matrix4(), p = new THREE.Vector3()
    for (let i = 0; i < node.count; i++) {
      node.getMatrixAt(i, m)
      p.setFromMatrixPosition(m)
      expect(Math.hypot(p.x, p.z)).toBeGreaterThan(6 * 0.84)
      const scale = new THREE.Vector3().setFromMatrixScale(m).y
      expect(p.y + scale * 0.03).toBeCloseTo(field(p.x, p.z) + 3, 2)
    }
  })
  it('rebuilds a scatter when the terrain under it changes, and casts shadows from solid things only', () => {
    const scene = emptyScene()
    scene.objects = [object('terrain', {}, 'ground'), object('scatter', { item: 'grass', count: 10, on: 'ground' }, 'grass'), makeObject('box', 'Box')]
    const built = createSceneReconciler(parseScene(scene))
    const before = built.objects.get('grass')
    expect(built.objects.get('ground')!).toMatchObject({ castShadow: false, receiveShadow: true })
    expect(before).toMatchObject({ castShadow: true })
    built.reconcile(applyOperations(parseScene(scene), [{ op: 'update', id: 'ground', patch: { params: { height: 9 } } }]))
    expect(built.objects.get('grass')).not.toBe(before)
    built.dispose()
  })
})

describe('Scene look', () => {
  it('fills what a look leaves out and merges look patches', () => {
    const scene = emptyScene()
    expect(resolveLook(scene)).toEqual(DEFAULT_LOOK)
    const next = applyOperations(scene, [{ op: 'settings', settings: { look: { environment: 'sky', fog: 0.3 } } }])
    const later = applyOperations(next, [{ op: 'settings', settings: { look: { sunElevation: 12 } } }])
    expect(later.settings.look).toEqual({ environment: 'sky', fog: 0.3, sunElevation: 12 })
    expect(resolveLook(later)).toMatchObject({ environment: 'sky', fog: 0.3, sunElevation: 12, shadows: 'soft' })
    expect(() => applyOperations(scene, [{ op: 'settings', settings: { look: { fog: 3 } } }])).toThrow()
  })
  it('puts the sun overhead at 90° and on the horizon at 0°', () => {
    expect(sunDirection(90, 0).y).toBeCloseTo(1)
    const east = sunDirection(0, 90)
    expect(east.y).toBeCloseTo(0)
    expect(east.x).toBeCloseTo(1)
  })
})
