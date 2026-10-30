import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import * as THREE from 'three'
import { emptyScene, makeObject, parseScene } from './scene'
import { generatedNode } from './generators'
import { generatorParams } from './generatorSpecs.mjs'
import { STRUCTURE_KINDS, type PartStyle } from './structures'
import { createSceneReconciler } from './threeScene'
import { KIT, KIT_NAMES } from './kit.mjs'
import { objectsFromModel } from './importModel'
import type { SceneObject } from '../types'

const object = (kind: SceneObject['kind'], params: Record<string, number | string> = {}, id: string = kind): SceneObject => ({
  ...makeObject(kind, kind),
  id,
  params: { ...generatorParams(kind), ...params },
})

describe('Made things', () => {
  it('builds every kind in parts, one material group per part', () => {
    for (const kind of STRUCTURE_KINDS) {
      const geometry = generatedNode(object(kind), null).geometry
      const parts = geometry.userData.parts as PartStyle[]
      expect(parts.length).toBeGreaterThan(0)
      expect(geometry.groups.map(group => group.materialIndex)).toEqual(parts.map((_, index) => index))
      expect(geometry.hasAttribute('color')).toBe(true)
    }
  })
  it('gives a building its siding relief, porch and lit windows from parameters, the same for the same seed', () => {
    const plain = generatedNode(object('building', { siding: 'plaster', porch: 'none' }), null).geometry
    const clapboard = generatedNode(object('building', { siding: 'clapboard', porch: 'front', windowGlow: 1 }), null).geometry
    expect(clapboard.getAttribute('position').count).toBeGreaterThan(plain.getAttribute('position').count)
    const parts = clapboard.userData.parts as PartStyle[]
    expect(parts.some(part => part.emissive && part.emissiveIntensity! > 0)).toBe(true)
    expect(parts.some(part => part.surface === 'planks')).toBe(true)
    const again = generatedNode(object('building', { siding: 'clapboard', porch: 'front', windowGlow: 1 }), null).geometry
    expect(Array.from(again.getAttribute('position').array.slice(0, 300))).toEqual(Array.from(clapboard.getAttribute('position').array.slice(0, 300)))
    for (const roof of ['hip', 'shed'])
      expect(generatedNode(object('building', { roof, roofing: 'metal' }), null).geometry.getAttribute('position').count).toBeGreaterThan(0)
  })
  it('finishes each part with its own material in the scene', () => {
    const scene = emptyScene()
    scene.objects = [object('building', { windowGlow: 2 }, 'house')]
    const built = createSceneReconciler(parseScene(scene))
    const house = built.objects.get('house') as THREE.Mesh
    const materials = house.material as THREE.MeshStandardMaterial[]
    expect(Array.isArray(materials)).toBe(true)
    expect(materials.length).toBe((house.geometry.userData.parts as PartStyle[]).length)
    expect(materials.some(material => material.emissiveIntensity > 0)).toBe(true)
    expect(materials.some(material => material.metalness > 0.5)).toBe(true)
    built.dispose()
  })
})

describe('Kit models', () => {
  it('ships every listed model with its credit, and places them by name only', () => {
    const credits = readFileSync(new URL('../../public/kit/CREDITS.md', import.meta.url), 'utf8')
    for (const model of KIT) {
      expect(existsSync(new URL(`../../public/kit/${model.name}.glb`, import.meta.url))).toBe(true)
      expect(credits).toContain(`${model.name}.glb`)
    }
    expect(KIT_NAMES.length).toBeGreaterThanOrEqual(20)
    const scene = emptyScene()
    scene.objects = [object('model', { name: 'barrel' })]
    expect(parseScene(scene).objects[0]!.params).toEqual({ name: 'barrel' })
    scene.objects = [object('model', { name: 'spaceship' })]
    expect(() => parseScene(scene)).toThrow(/name must be one of/)
  })
  it('keeps a kit model as a group that fills when it loads, and settles even when it cannot', async () => {
    const scene = emptyScene()
    scene.objects = [object('model', { name: 'barrel' }, 'cask')]
    const built = createSceneReconciler(parseScene(scene))
    expect(built.objects.get('cask')).toBeInstanceOf(THREE.Group)
    await built.ready
    built.dispose()
  })
})

describe('Model import', () => {
  it('keeps base colour and lists the texture maps it leaves out', () => {
    const material = new THREE.MeshStandardMaterial({ normalMap: new THREE.Texture(), roughnessMap: new THREE.Texture() })
    const root = new THREE.Group()
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), material))
    const objects = objectsFromModel(root, 'crate')
    expect(objects.some(item => item.kind === 'mesh')).toBe(true)
    expect([...objects.droppedMaps].sort()).toEqual(['normalMap', 'roughnessMap'])
  })
})
