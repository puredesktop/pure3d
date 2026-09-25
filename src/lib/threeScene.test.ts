import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { emptyScene, makeObject, applyOperations } from './scene'
import {
  buildScene,
  createSceneReconciler,
  makeAnimation,
  updatePose,
  disposeScene,
  exportScene,
} from './threeScene'
import { meshGeometry } from './geometry'
import { VertexHandles } from './VertexHandles'
import { SceneStore } from './SceneStore'
import { importModel, assertSelfContainedGLB } from './importModel'

describe('Three.js document adapter', () => {
  it('reconciles a large scene without replacing unaffected nodes', () => {
    const scene = emptyScene()
    scene.objects = Array.from({ length: 100 }, () => makeObject('box'))
    const reconciled = createSceneReconciler(scene)
    const retained = reconciled.objects.get(scene.objects[1].id)!
    const changed = reconciled.objects.get(scene.objects[0].id) as THREE.Mesh
    const retainedGeometry = (retained as THREE.Mesh).geometry
    const changedGeometry = changed.geometry
    const next = structuredClone(scene)
    next.objects[0].material.color = '#ff0000'
    reconciled.reconcile(next)
    expect(reconciled.objects.get(scene.objects[1].id)).toBe(retained)
    expect((reconciled.objects.get(scene.objects[1].id) as THREE.Mesh).geometry).toBe(retainedGeometry)
    expect((reconciled.objects.get(scene.objects[0].id) as THREE.Mesh).geometry).toBe(changedGeometry)
    reconciled.dispose()
  })
  it('does not request scene reconciliation for camera or selection changes', () => {
    const scene = emptyScene()
    const object = makeObject('box')
    scene.objects = [object]
    const store = new SceneStore(scene)
    const reconciled = createSceneReconciler(store.getContentSnapshot())
    const node = reconciled.objects.get(object.id)
    let contentUpdates = 0
    const unsubscribe = store.subscribeContent(() => contentUpdates++)
    store.setCamera({ position: [4, 4, 4], target: [0, 0, 0] })
    store.workspace({ selectedId: object.id })
    expect(contentUpdates).toBe(0)
    expect(reconciled.objects.get(object.id)).toBe(node)
    unsubscribe()
    reconciled.dispose()
  })
  it('keeps shared texture uploads cached while bindings retain independent UVs', async () => {
    const load = vi
      .spyOn(THREE.ImageLoader.prototype, 'load')
      .mockImplementation((_url, complete) => {
        complete?.({ width: 2, height: 2 } as HTMLImageElement)
        return {} as HTMLImageElement
      })
    const scene = emptyScene()
    scene.textureAssets = [{ id: 'shared', dataUrl: 'data:image/png;base64,AA==' }]
    scene.objects = Array.from({ length: 100 }, (_, index) => {
      const object = makeObject('box')
      object.material.texture = {
        assetId: 'shared',
        repeat: [index + 1, 1],
      }
      return object
    })
    const reconciled = createSceneReconciler(scene)
    await reconciled.ready
    const first = reconciled.objects.get(scene.objects[0].id) as THREE.Mesh
    const second = reconciled.objects.get(scene.objects[1].id) as THREE.Mesh
    const firstMap = (first.material as THREE.MeshStandardMaterial).map!
    const secondMap = (second.material as THREE.MeshStandardMaterial).map!
    expect(load).toHaveBeenCalledTimes(1)
    expect(firstMap).not.toBe(secondMap)
    expect(firstMap.source).toBe(secondMap.source)
    expect(firstMap.repeat.x).toBe(1)
    expect(secondMap.repeat.x).toBe(2)
    const next = structuredClone(scene)
    next.objects[0].material.color = '#ff0000'
    reconciled.reconcile(next)
    await reconciled.ready
    expect(load).toHaveBeenCalledTimes(1)
    reconciled.dispose()
  })
  it('preserves hierarchy, materials, visibility and animated local transforms', () => {
    const scene = emptyScene()
    const parent = makeObject('group')
    const child = makeObject('box')
    child.parentId = parent.id
    parent.transform.position = [3, 0, 0]
    child.material.color = '#ff0000'
    child.material.opacity = 0.4
    scene.objects = [parent, child]
    scene.keyframes = [
      {
        objectId: child.id,
        property: 'position',
        time: 0,
        value: [0, 0, 0],
        easing: 'linear',
      },
      {
        objectId: child.id,
        property: 'position',
        time: 4,
        value: [4, 0, 0],
        easing: 'linear',
      },
    ]
    const built = buildScene(scene)
    updatePose(scene, built.objects, 2)
    built.root.updateMatrixWorld(true)
    const mesh = built.objects.get(child.id) as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshStandardMaterial
    >
    expect(mesh.getWorldPosition(new THREE.Vector3()).x).toBe(5)
    expect(mesh.material.color.getHexString()).toBe('ff0000')
    expect(mesh.material.transparent).toBe(true)
    const animation = makeAnimation(scene, built.objects)[0]
    expect(animation.tracks[0].name).toBe(`${mesh.uuid}.position`)
    expect(animation.duration).toBe(5)
    disposeScene(built.root)
  })
  it('converts primitives to editable mesh data without changing their geometry', () => {
    for (const kind of [
      'box',
      'sphere',
      'cylinder',
      'cone',
      'torus',
      'plane',
    ] as const) {
      const scene = emptyScene()
      const object = makeObject(kind)
      scene.objects.push(object)
      const geometry = meshGeometry(object)
      const result = applyOperations(scene, [
        { op: 'mesh', id: object.id, geometry },
      ])
      expect(result.objects[0].kind).toBe('mesh')
      expect(geometry.positions.length % 3).toBe(0)
      expect(geometry.indices!.length % 3).toBe(0)
      expect(geometry.uv).toHaveLength((geometry.positions.length / 3) * 2)
    }
  })
  it('subdivides shared edges, retains UVs, and commits seam vertex edits with undo', () => {
    const scene = emptyScene()
    const object = makeObject('plane')
    scene.objects.push(object)
    const store = new SceneStore(scene)
    store.workspace({ selectedId: object.id })
    expect(() => store.workspace({ selectedVertex: 0 })).toThrow('mesh vertex')
    store.edit([{ op: 'subdivide', id: object.id }])
    const geometry = store.getSnapshot().scene.objects[0].geometry!
    expect(geometry.positions).toHaveLength(72)
    expect(geometry.uv).toHaveLength(48)
    const center = geometry.positions.flatMap((_, i) =>
      i % 3 === 0 && geometry.positions.slice(i, i + 3).every(n => n === 0)
        ? [i / 3]
        : [],
    )
    expect(center.length).toBeGreaterThan(1)
    store.workspace({ selectedVertex: center[0] })
    store.edit([
      {
        op: 'moveVertex',
        id: object.id,
        index: center[0],
        position: [0, 0, 1],
      },
    ])
    const edited = store.getSnapshot().scene.objects[0].geometry!
    for (const index of center)
      expect(edited.positions.slice(index * 3, index * 3 + 3)).toEqual([
        0, 0, 1,
      ])
    expect(edited.uv).toEqual(geometry.uv)
    store.history('undo')
    expect(store.getSnapshot().scene.objects[0].geometry).toEqual(geometry)
    store.history('undo')
    expect(store.getSnapshot().selectedVertex).toBeNull()
  })
  it('previews vertex handles in mesh coordinates and restores uncommitted geometry on disposal', () => {
    const object = makeObject('box')
    const geometry = meshGeometry(object)
    object.kind = 'mesh'
    object.geometry = geometry
    const scene = emptyScene()
    scene.objects.push(object)
    const built = buildScene(scene)
    const mesh = built.objects.get(object.id) as THREE.Mesh
    const handles = new VertexHandles(mesh, geometry, 0)
    handles.pivot.position.set(2, 3, 4)
    handles.preview()
    expect(mesh.geometry.getAttribute('position').getX(0)).toBe(2)
    expect(mesh.geometry.boundingBox!.max.x).toBe(2)
    expect(handles.points.geometry.getAttribute('position').getY(0)).toBe(3)
    handles.dispose()
    expect(mesh.children).toHaveLength(0)
    expect(mesh.geometry.getAttribute('position').getX(0)).toBe(
      geometry.positions[0],
    )
    disposeScene(built.root)
  })
  it('exports current poses as OBJ/STL and imports their triangle geometry', async () => {
    const scene = emptyScene()
    const object = makeObject()
    object.transform.position = [4, 0, 0]
    scene.objects.push(object)
    const obj = await exportScene(scene, 'obj', 0)
    expect(obj.data).toContain('v 4.5')
    const objects = await importModel(obj.data, 'obj')
    expect(objects.filter(o => o.kind === 'mesh')).toHaveLength(1)
    const stl = await exportScene(scene, 'stl', 0)
    expect(stl.data).toContain('facet normal')
    const roundtrip = await importModel(
      new TextEncoder().encode(stl.data as string).buffer,
      'stl',
    )
    expect(
      roundtrip.find(o => o.kind === 'mesh')!.geometry!.positions,
    ).toHaveLength(108)
    object.visible = false
    expect((await exportScene(scene, 'obj', 0)).data).not.toContain('\nv ')
  })
  it('rejects GLBs containing external resources or unsupported animation', () => {
    const glb = (json: unknown) => {
      let text = JSON.stringify(json)
      while (text.length % 4) text += ' '
      const bytes = new TextEncoder().encode(text)
      const data = new ArrayBuffer(20 + bytes.length)
      const view = new DataView(data)
      view.setUint32(0, 0x46546c67, true)
      view.setUint32(4, 2, true)
      view.setUint32(8, data.byteLength, true)
      view.setUint32(12, bytes.length, true)
      view.setUint32(16, 0x4e4f534a, true)
      new Uint8Array(data, 20).set(bytes)
      return data
    }
    expect(() =>
      assertSelfContainedGLB(
        glb({ buffers: [{ uri: 'https://example.com/model.bin' }] }),
      ),
    ).toThrow('self-contained')
    expect(() => assertSelfContainedGLB(glb({ animations: [{}] }))).toThrow(
      'existing animation',
    )
    expect(() =>
      assertSelfContainedGLB(glb({ asset: { version: '2.0' }, buffers: [{}] })),
    ).not.toThrow()
  })
})
