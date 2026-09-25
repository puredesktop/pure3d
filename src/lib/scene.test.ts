import { describe, expect, it } from 'vitest'
import {
  applyOperations,
  emptyScene,
  makeObject,
  parseScene,
  pose,
  transformOperations,
  resolveMaterial,
} from './scene'
import { SceneStore } from './SceneStore'
import { geometrySchema } from './schemas.mjs'

describe('Scene transactions', () => {
  it('refuses a broken hierarchy without changing the original document', () => {
    const scene = emptyScene()
    const object = makeObject()
    scene.objects.push(object)
    expect(() =>
      applyOperations(scene, [
        { op: 'update', id: object.id, patch: { parentId: object.id } },
      ]),
    ).toThrow('hierarchy cycle')
    expect(scene.objects[0].parentId).toBeNull()
    expect(() =>
      applyOperations(scene, [
        { op: 'update', id: object.id, patch: { name: 'Changed' } },
        { op: 'delete', id: 'missing' },
      ]),
    ).toThrow('Unknown object')
    expect(scene.objects[0].name).toBe('box')
  })
  it('duplicates and deletes a complete subtree with its animation', () => {
    const parent = makeObject('group')
    const child = makeObject()
    child.parentId = parent.id
    const scene = emptyScene()
    scene.objects.push(parent, child)
    scene.keyframes.push({
      objectId: child.id,
      property: 'position',
      time: 0,
      value: [1, 2, 3],
      easing: 'linear',
    })
    const next = applyOperations(scene, [
      { op: 'duplicate', id: parent.id, newId: 'copy' },
    ])
    const copiedChild = next.objects.find(o => o.parentId === 'copy')!
    expect(
      next.keyframes.find(k => k.objectId === copiedChild.id)?.value,
    ).toEqual([1, 2, 3])
    const removed = applyOperations(next, [{ op: 'delete', id: parent.id }])
    expect(removed.objects.map(o => o.id)).toEqual(['copy', copiedChild.id])
    expect(removed.keyframes).toHaveLength(1)
  })
  it('rejects bad geometry, duplicate IDs and keyframes outside the timeline', () => {
    expect(() =>
      geometrySchema.parse({
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        indices: [0, 1, 3],
      }),
    ).toThrow('Index outside')
    expect(() =>
      geometrySchema.parse({
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        indices: null,
        uv: [0, 0],
      }),
    ).toThrow('UV coordinates')
    const scene = emptyScene()
    const object = makeObject()
    scene.objects.push(object, object)
    expect(() => parseScene(scene)).toThrow('Duplicate object IDs')
    scene.objects.pop()
    scene.keyframes.push({
      objectId: object.id,
      time: 10,
      property: 'scale',
      value: [1, 1, 1],
      easing: 'linear',
    })
    expect(() => parseScene(scene)).toThrow('Invalid or duplicate keyframe')
  })
  it('migrates embedded textures into shared assets and resolves inherited bindings independently', () => {
    const legacy = emptyScene()
    const group = makeObject('group')
    const first = makeObject('group')
    first.kind = 'mesh'
    first.geometry = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: null }
    const second = structuredClone(first)
    second.id = 'second'
    first.parentId = group.id
    second.parentId = group.id
    first.material = { texture: { dataUrl: 'data:image/png;base64,AQID', repeat: [2, 1] } } as never
    second.material = { texture: { dataUrl: 'data:image/png;base64,AQID', offset: [0.5, 0] } } as never
    legacy.objects = [group, first, second]
    delete (legacy as Partial<typeof legacy>).textureAssets
    const migrated = parseScene(legacy)
    expect(migrated.textureAssets).toHaveLength(1)
    expect(migrated.objects[1].material.texture?.assetId).toBe(migrated.textureAssets[0].id)
    const store = new SceneStore(migrated)
    store.edit([
      {
        op: 'update',
        id: group.id,
        patch: { material: { color: '#ffffff', texture: { assetId: migrated.textureAssets[0].id, repeat: [3, 2] } } },
      },
      { op: 'update', id: first.id, patch: { material: { texture: { offset: [0.25, 0] } } } },
      { op: 'update', id: second.id, patch: { material: { texture: null } } },
    ])
    const scene = store.getSnapshot().scene
    expect(resolveMaterial(scene, scene.objects[1]).texture).toMatchObject({ repeat: [2, 1], offset: [0.25, 0] })
    expect(resolveMaterial(scene, scene.objects[2]).texture).toBeNull()
    expect(scene.objects[1].geometry!.uv).toEqual([0, 0, 1, 0, 0, 1])
    const saved = parseScene(JSON.parse(JSON.stringify(scene)))
    expect(saved).toEqual(scene)
    store.history('undo')
    expect(resolveMaterial(store.getSnapshot().scene, store.getSnapshot().scene.objects[2]).texture).not.toBeNull()
  })
  it('keeps the active content in one store across edits, undo, redo, and opening', () => {
    const store = new SceneStore()
    const initial = store.getSnapshot().scene
    const object = makeObject()
    store.edit([{ op: 'add', object }])
    expect(store.getSnapshot().scene.objects).toEqual([object])
    store.history('undo')
    expect(store.getSnapshot().scene).toBe(initial)
    store.history('redo')
    expect(store.getSnapshot().scene.objects).toEqual([object])
    const opened = emptyScene('Opened')
    store.replace(opened)
    expect(store.getSnapshot().scene).toEqual(opened)
    expect(store.getSnapshot()).toMatchObject({ canUndo: false, canRedo: false })
  })
  it('keeps camera navigation and selection out of scene history while exposing affected domains', () => {
    const store = new SceneStore()
    const original = store.getSnapshot().scene
    const changes: string[] = []
    let cameraUpdates = 0
    store.subscribe(change => changes.push(`${change.domain}:${change.affected.join(',')}`))
    store.subscribeCamera(() => cameraUpdates++)

    store.workspace({ selectedId: null, mode: 'rotate' })
    const workspaceSnapshot = store.getSnapshot()
    store.setCamera({ position: [8, 5, 9], target: [1, 0, 0] })
    expect(store.getSnapshot().scene).toBe(original)
    expect(store.getDocument()).toBe(original)
    expect(store.getSnapshot().canUndo).toBe(false)
    expect(changes).toEqual(['workspace:mode', 'camera:camera'])
    expect(store.getSnapshot()).toBe(workspaceSnapshot)
    expect(cameraUpdates).toBe(1)

    store.persistCamera()
    expect(changes).toEqual([
      'workspace:mode',
      'camera:camera',
      'camera:camera',
    ])
    expect(store.getSnapshot().scene).toBe(original)
    expect(store.getSnapshot()).toBe(workspaceSnapshot)
    expect(cameraUpdates).toBe(1)
    expect(store.getDocument().settings.camera).toEqual({
      position: [8, 5, 9],
      target: [1, 0, 0],
    })

    store.edit([
      {
        op: 'settings',
        settings: {
          camera: { position: [3, 4, 5], target: [0, 1, 0] },
        },
      },
    ])
    expect(cameraUpdates).toBe(2)
    expect(store.getCameraSnapshot()).toEqual({
      position: [3, 4, 5],
      target: [0, 1, 0],
    })
  })
  it('only notifies affected editor surfaces for transient workspace changes', () => {
    const store = new SceneStore()
    let outlineUpdates = 0
    let timelineUpdates = 0
    store.subscribeAffected(['scene', 'selectedId'], () => outlineUpdates++)
    store.subscribeAffected(['scene', 'selectedId', 'time', 'playing'], () =>
      timelineUpdates++,
    )

    store.workspace({ playing: true })
    store.tick(0.1)

    expect(outlineUpdates).toBe(0)
    expect(timelineUpdates).toBe(2)
  })
})
describe('Animation', () => {
  it('interpolates each property and respects outgoing easing and exact key times', () => {
    const scene = emptyScene()
    const object = makeObject()
    scene.objects.push(object)
    scene.keyframes = [
      {
        objectId: object.id,
        property: 'position',
        time: 0,
        value: [0, 0, 0],
        easing: 'smooth',
      },
      {
        objectId: object.id,
        property: 'position',
        time: 4,
        value: [8, 0, 0],
        easing: 'linear',
      },
    ]
    expect(pose(scene, object, 1).position[0]).toBe(1.25)
    scene.keyframes[0].easing = 'step'
    expect(pose(scene, object, 3.99).position[0]).toBe(0)
    expect(pose(scene, object, 4).position[0]).toBe(8)
    expect(pose(scene, object, 2).scale).toEqual([1, 1, 1])
    const operations = transformOperations(
      scene,
      object.id,
      { position: [2, 0, 0], scale: [2, 2, 2] },
      2,
    )
    const next = applyOperations(scene, operations)
    expect(next.objects[0].transform.position).toEqual([0, 0, 0])
    expect(next.objects[0].transform.scale).toEqual([2, 2, 2])
    expect(pose(next, next.objects[0], 2).position).toEqual([2, 0, 0])
  })
  it('clamps scrubbing, loops playback and stops precisely at duration', () => {
    const store = new SceneStore()
    store.workspace({ time: 100 })
    expect(store.getSnapshot().time).toBe(5)
    store.workspace({ playing: true })
    expect(store.getSnapshot().time).toBe(0)
    store.tick(6)
    expect(store.getSnapshot().time).toBe(1)
    store.workspace({ time: 4, loop: false })
    store.tick(2)
    expect(store.getSnapshot().time).toBe(5)
    expect(store.getSnapshot().playing).toBe(false)
  })
})
