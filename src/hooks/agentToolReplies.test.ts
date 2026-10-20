import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { createToolHandlers } from './useAppAgentTools'
import { SceneStore } from '../lib/SceneStore'
import { emptyScene, makeObject } from '../lib/scene'
import type { ViewportAPI } from '../components/SceneViewport'
import type { SceneObject } from '../types'
import { BLANK_CAPTURE_MESSAGE } from '../lib/captureCheck'
import {
  readPlatformFileBinaryDataUrl,
  readPlatformTextFile,
  vision,
} from '../bridge/platformBridge'

vi.mock('../bridge/platformBridge', async importOriginal => ({
  ...(await importOriginal<typeof import('../bridge/platformBridge')>()),
  readPlatformFileBinaryDataUrl: vi.fn(),
  readPlatformTextFile: vi.fn(),
  writePlatformTextFile: vi.fn(),
  writePlatformFileBinary: vi.fn(),
}))

const KINDS = ['box', 'sphere', 'cylinder', 'cone', 'torus', 'plane'] as const

/** A scene about the size of the ones in the measured assignment run (~90k chars of JSON). */
function populate(store: SceneStore) {
  const set = { ...makeObject('group', 'Set'), id: 'set' }
  const props: SceneObject[] = Array.from({ length: 60 }, (_, i) => ({
    ...makeObject(KINDS[i % KINDS.length], `Prop ${i}`),
    id: `prop-${i}`,
    parentId: i % 2 ? 'set' : null,
    transform: {
      position: [(i % 8) * 1.5, 0, Math.floor(i / 8) * 1.5],
      rotation: [0, i * 0.1, 0],
      scale: [1, 1, 1],
    },
    material: { color: '#336699', roughness: 0.5, metalness: 0.1 },
  }))
  const meshes = Array.from({ length: 5 }, (_, i) => ({
    ...makeObject('box', `Rock ${i}`),
    id: `rock-${i}`,
    transform: { position: [i * 3, 0, -4], rotation: [0, 0, 0], scale: [1, 1, 1] },
  })) as SceneObject[]
  store.edit([
    { op: 'settings', settings: { duration: 10 } },
    { op: 'addTextureAsset', asset: { id: 'stone', dataUrl: 'data:image/png;base64,AQID' } },
    { op: 'add', object: set },
    ...[...props, ...meshes].map(object => ({ op: 'add' as const, object })),
    ...props.flatMap(object =>
      [0, 5].map(time => ({
        op: 'keyframe' as const,
        keyframe: {
          objectId: object.id,
          property: 'position' as const,
          time,
          value: [time, 1, 0] as [number, number, number],
          easing: 'smooth' as const,
        },
      })),
    ),
    ...meshes.flatMap(mesh => [
      { op: 'subdivide' as const, id: mesh.id },
      { op: 'subdivide' as const, id: mesh.id },
    ]),
  ])
}

function setup() {
  const store = new SceneStore()
  populate(store)
  const document = {
    doc: { path: '/Scenes/Big.pure3d', title: 'Big', status: 'filed' as const, savedAt: null, saving: false, error: null },
    save: vi.fn(async (path?: string) => path ?? '/Scenes/Big.pure3d'),
    open: vi.fn(async (path: string) => {
      const next = new SceneStore()
      populate(next)
      store.replace({ ...next.getSnapshot().scene, title: 'Opened' })
      return path
    }),
    create: vi.fn(async (title?: string) => {
      store.replace(emptyScene(title))
      return '/Drafts/New.pure3d'
    }),
  }
  const viewport = {
    current: {
      capture: vi.fn().mockResolvedValue('data:image/png;base64,AQID'),
      frame: vi.fn(),
    } as ViewportAPI | null,
  }
  const handlers = createToolHandlers(store, document, viewport)
  const call = async (name: keyof typeof handlers, args: Record<string, unknown> = {}) => {
    const reply = await handlers[name]({ shortName: name, toolCallId: 't', arguments: args })
    return { reply, size: reply.content.length, json: JSON.parse(reply.content) }
  }
  return { store, document, viewport, call }
}

const image = () =>
  vi.spyOn(THREE.ImageLoader.prototype, 'load').mockImplementation((_url, onLoad) => {
    const element = { width: 2, height: 2 } as HTMLImageElement
    queueMicrotask(() => onLoad?.(element))
    return element
  })

afterEach(() => vi.restoreAllMocks())

describe('Agent tool replies', () => {
  it('reports every tool reply size against a realistic scene', async () => {
    const { store, call } = setup()
    const sizes: Record<string, number> = {}
    const full = JSON.stringify(store.getSnapshot().scene, (k, v) => (k === 'dataUrl' ? undefined : v)).length
    expect(full).toBeGreaterThan(70_000)
    sizes['(scene JSON)'] = full
    sizes.getScene = (await call('getScene')).size
    sizes['getScene summary'] = (await call('getScene', { summary: true }).catch(() => ({ size: NaN }))).size
    sizes['getScene ids'] = (await call('getScene', { ids: ['prop-3'] }).catch(() => ({ size: NaN }))).size
    sizes.editScene = (await call('editScene', {
      operations: [{ op: 'update', id: 'prop-3', patch: { transform: { position: [1, 2, 3] } } }],
    })).size
    sizes.setWorkspace = (await call('setWorkspace', { selectedId: 'prop-3' })).size
    sizes['setWorkspace frame'] = (await call('setWorkspace', { frameSelection: true })).size
    sizes.saveScene = (await call('saveScene')).size
    sizes.history = (await call('history', { direction: 'undo' })).size
    vi.mocked(readPlatformTextFile).mockResolvedValue('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n')
    sizes.importModel = (await call('importModel', { path: '/tri.obj' })).size
    vi.mocked(readPlatformFileBinaryDataUrl).mockResolvedValue('data:image/png;base64,AQID')
    image()
    sizes.importTexture = (await call('importTexture', { id: 'prop-4', path: '/t.png' })).size
    vi.spyOn(vision, 'generate').mockResolvedValue({ base64: 'AQID', mimeType: 'image/png', modelId: 'm', provider: 'openrouter' })
    sizes.generateTexture = (await call('generateTexture', { id: 'prop-5', prompt: 'stone' })).size
    sizes.applyTexture = (await call('applyTexture', { assetId: 'stone', objectIds: ['set'], recursive: true })).size
    sizes.patchTextures = (await call('patchTextures', { objectIds: ['prop-1'], patch: { color: '#112233' } })).size
    sizes.exportModel = (await call('exportModel', { path: '/out.obj', format: 'obj' })).size
    sizes.captureViewport = (await call('captureViewport')).size
    sizes.openScene = (await call('openScene', { path: '/Other.pure3d' })).size
    sizes.newScene = (await call('newScene', { title: 'Fresh' })).size
    if (process.env.PURE3D_REPLY_SIZES) console.table(sizes)
    for (const name of ['editScene', 'setWorkspace', 'setWorkspace frame', 'saveScene', 'importModel', 'importTexture', 'generateTexture', 'patchTextures', 'exportModel', 'captureViewport', 'newScene'])
      expect(sizes[name], name).toBeLessThan(800)
    // A recursive apply over a 31-object subtree: both id lists hit their cap.
    expect(sizes.applyTexture).toBeLessThan(1_500)
    expect(sizes.history).toBeLessThan(1_500)
    expect(sizes.openScene).toBeLessThan(2_500)
    expect(sizes['getScene summary']).toBeLessThan(full / 4)
    expect(sizes['getScene ids']).toBeLessThan(5_000)
    expect(sizes.getScene).toBeGreaterThan(full)
  })

  it('summarises an edit with ids, counts and the document binding', async () => {
    const { call } = setup()
    const added = { ...makeObject('sphere', 'Moon'), id: 'moon' }
    const { json } = await call('editScene', {
      operations: [
        { op: 'add', object: added },
        { op: 'update', id: 'prop-1', patch: { name: 'Renamed' } },
        { op: 'delete', id: 'prop-2' },
        { op: 'keyframe', keyframe: { objectId: 'moon', property: 'scale', time: 1, value: [2, 2, 2], easing: 'linear' } },
        { op: 'settings', settings: { duration: 12 } },
      ],
    })
    expect(json).toMatchObject({
      ok: true,
      operations: 5,
      path: '/Scenes/Big.pure3d',
      scene: { title: 'Untitled scene', objects: 66, duration: 12 },
      changes: {
        added: ['moon'],
        updated: ['prop-1'],
        removed: ['prop-2'],
        keyframes: { added: 1, removed: 2 },
        settings: ['duration'],
      },
      canUndo: true,
    })
    expect(json).not.toHaveProperty('scene.objects.0')
    expect(JSON.stringify(json)).not.toContain('"transform"')
  })

  it('caps id lists for large batches and reports the remainder', async () => {
    const { call } = setup()
    const operations = Array.from({ length: 200 }, (_, i) => ({
      op: 'add',
      object: { ...makeObject('box', `Crate ${i}`), id: crypto.randomUUID() },
    }))
    const { json, size } = await call('editScene', { operations })
    expect(json.changes.added).toHaveLength(25)
    expect(json.changes.addedMore).toBe(175)
    expect(size).toBeLessThan(1_500)
    const deleted = await call('editScene', { operations: [{ op: 'delete', id: 'set' }] })
    expect(deleted.json.changes.removed).toHaveLength(25)
    expect(deleted.json.changes.removedMore).toBe(6)
    expect(deleted.json.changes.keyframes).toEqual({ removed: 60 })
  })

  it('replies to workspace changes with the workspace state, not the scene', async () => {
    const { call, viewport, document } = setup()
    const { json } = await call('setWorkspace', { selectedId: 'prop-7', time: 2, mode: 'rotate' })
    expect(json).toMatchObject({
      ok: true,
      workspace: { selectedId: 'prop-7', time: 2, mode: 'rotate', playing: false },
      selected: { id: 'prop-7', name: 'Prop 7', kind: 'sphere' },
    })
    expect(json).not.toHaveProperty('path')
    const framed = await call('setWorkspace', { frameSelection: true })
    expect(viewport.current!.frame).toHaveBeenCalled()
    expect(document.save).toHaveBeenCalledTimes(1)
    expect(framed.json).toMatchObject({ ok: true, path: '/Scenes/Big.pure3d', camera: { position: expect.any(Array) } })
  })

  it('describes history as short entries and the change it reverted', async () => {
    const { call } = setup()
    await call('editScene', { operations: [{ op: 'update', id: 'prop-1', patch: { visible: false } }] })
    const { json, size } = await call('history', { direction: 'undo' })
    expect(json).toMatchObject({
      ok: true,
      direction: 'undo',
      changes: { updated: ['prop-1'] },
      canRedo: true,
      redo: ['updated prop-1'],
    })
    expect(json.undo[0]).toMatch(/^added 66 objects/)
    expect(size).toBeLessThan(1_000)
  })

  it('returns a capture with a one-line note and no scene', async () => {
    const { call } = setup()
    const { reply, json } = await call('captureViewport')
    expect(reply.images).toEqual([{ mimeType: 'image/png', data: 'AQID' }])
    expect(json).toMatchObject({ ok: true, time: 0, note: expect.stringContaining('Rendered') })
    expect(reply.content).not.toContain('objects')
  })

  it('reports an undrawn viewport as an error, with no image', async () => {
    const { call, viewport } = setup()
    vi.mocked(viewport.current!.capture).mockRejectedValue(new Error(BLANK_CAPTURE_MESSAGE))
    await expect(call('captureViewport')).rejects.toThrow("The viewport isn't drawn")
  })

  it('opens and saves with a header and a capped outline', async () => {
    const { call } = setup()
    const opened = await call('openScene', { path: '/Other.pure3d' })
    expect(opened.json).toMatchObject({
      ok: true,
      path: '/Other.pure3d',
      scene: { title: 'Opened', objects: 66, keyframes: 120 },
      outlineMore: 46,
    })
    expect(opened.json.outline).toHaveLength(20)
    expect(opened.json.outline[0]).toEqual({ id: 'set', name: 'Set', kind: 'group' })
    const saved = await call('saveScene', { path: '/Copy.pure3d' })
    expect(saved.json).toMatchObject({ ok: true, path: '/Copy.pure3d', scene: { title: 'Opened' } })
  })
})

describe('getScene filters', () => {
  it('keeps the full read when called without arguments', async () => {
    const { store, call } = setup()
    const { json } = await call('getScene')
    expect(json.scene.objects).toHaveLength(store.getSnapshot().scene.objects.length)
    expect(json.scene.keyframes).toHaveLength(120)
    expect(json).toMatchObject({ path: '/Scenes/Big.pure3d', units: 'meters' })
    expect(json.scene.textureAssets[0]).toEqual({ id: 'stone' })
  })

  it('filters by ids with descendants and keeps only their keyframes', async () => {
    const { call } = setup()
    const { json } = await call('getScene', { ids: ['prop-0', 'nope'] })
    expect(json.scene.objects.map((o: SceneObject) => o.id)).toEqual(['prop-0'])
    expect(json.scene.keyframes).toHaveLength(2)
    expect(json.match).toEqual({ objects: 1, totalObjects: 66, missingIds: ['nope'] })
    const group = await call('getScene', { ids: ['set'], includeDescendants: true, summary: true })
    expect(group.json.objects).toHaveLength(31)
    expect(group.json.objects[0]).toEqual({ id: 'set', name: 'Set', kind: 'group' })
  })

  it('filters by kind, name and world-space area, and can drop mesh arrays', async () => {
    const { call } = setup()
    const meshes = await call('getScene', { kinds: ['mesh'], geometry: false })
    expect(meshes.json.scene.objects.map((o: SceneObject) => o.id)).toEqual(['rock-0', 'rock-1', 'rock-2', 'rock-3', 'rock-4'])
    expect(meshes.json.scene.objects[0].geometry).toEqual({ vertices: expect.any(Number), triangles: 192, uv: true })
    const named = await call('getScene', { name: 'prop 1', summary: true })
    expect(named.json.objects.map((o: { id: string }) => o.id)).toEqual(['prop-1', ...Array.from({ length: 10 }, (_, i) => `prop-1${i}`)])
    const area = await call('getScene', { within: { min: [-0.1, -1, -0.1], max: [1.6, 1, 0.1] }, summary: true })
    expect(area.json.objects.map((o: { id: string }) => o.id)).toEqual(['set', 'prop-0', 'prop-1'])
  })

  it('summarises counts by kind with a bounded object list', async () => {
    const { call } = setup()
    const { json, size } = await call('getScene', { summary: true, limit: 5 })
    expect(json.scene.counts).toMatchObject({
      objects: 66,
      keyframes: 120,
      textureAssets: 1,
      byKind: { group: 1, box: 10, sphere: 10, mesh: 5 },
    })
    expect(json.objects).toHaveLength(5)
    expect(json.objectsMore).toBe(61)
    expect(json.scene.textureAssetIds).toEqual(['stone'])
    expect(json).toMatchObject({ path: '/Scenes/Big.pure3d', selectedId: null })
    expect(size).toBeLessThan(1_200)
  })
})
