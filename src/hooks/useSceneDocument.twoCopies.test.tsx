// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlatformDocumentFilePayload } from '@purescience/platform-ui/bridge/documents'

/**
 * Two live copies of Pure3D over one .pure3d file: a normal tab and a copy held inside a page. Two real SceneStores and two
 * real document hooks over one fake disk. Every read and write takes a turn of the event loop, as the shell's do, so two
 * copies' read-then-write really can interleave. The store beside the file is the shell's conditional JSON store.
 */
const disk = vi.hoisted(() => {
  const state = {
    text: null as string | null,
    writes: 0,
    quiet: false,
    listeners: new Set<(change: { kind: string; path: string }) => void>(),
    lease: { value: null as unknown, version: null as string | null, count: 0 },
  }
  const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))
  return { state, tick }
})
vi.mock('@purescience/platform-ui/bridge/documents', () => ({
  autosavePlatformDocument: vi.fn(async (request: { path: string; files: PlatformDocumentFilePayload[] }) => {
    const text = request.files[0]!.content as string
    await disk.tick()
    disk.state.text = text
    disk.state.writes += 1
    if (!disk.state.quiet) for (const listener of disk.state.listeners) listener({ kind: 'content', path: request.path })
    return { savedAt: '2026-11-02T00:00:00.000Z' }
  }),
  createPlatformDraft: vi.fn(async () => ({ path: '/Drafts/Scene.pure3d' })),
  duplicatePlatformDocument: vi.fn(),
  promotePlatformDocument: vi.fn(),
  renamePlatformDocument: vi.fn(),
  touchPlatformRecentDocument: vi.fn(async () => undefined),
  onPlatformDocumentsChanged: vi.fn((listener: (change: { kind: string; path: string }) => void) => {
    disk.state.listeners.add(listener)
    return () => disk.state.listeners.delete(listener)
  }),
}))
vi.mock('@purescience/platform-ui/bridge/fs', () => ({
  readPlatformTextFile: vi.fn(async () => { const text = disk.state.text; await disk.tick(); return text }),
  writePlatformTextFile: vi.fn(async (_path: string, text: string) => { await disk.tick(); disk.state.text = text }),
}))
vi.mock('@purescience/platform-ui/bridge/storage', () => ({
  readPlatformStorageJson: vi.fn(async () => { await disk.tick(); return { value: disk.state.lease.value, version: disk.state.lease.version } }),
  writePlatformStorageJson: vi.fn(async ({ value, ifMatch }: { value: unknown; ifMatch: string | null }) => {
    await disk.tick()
    const lease = disk.state.lease
    if (ifMatch !== lease.version) return { ok: false, conflict: true, version: lease.version }
    lease.value = value
    lease.version = `v${++lease.count}`
    return { ok: true, version: lease.version }
  }),
}))
vi.mock('@purescience/platform-ui/bridge/client', () => ({
  bridge: { onEvent: vi.fn(() => () => undefined), call: vi.fn(async () => ({ ok: true })) },
}))
vi.mock('@purescience/platform-ui/bridge/workspace', () => ({ updateCurrentWorkspaceTab: vi.fn(async () => ({ updated: true })) }))

import { SceneStore } from '../lib/SceneStore'
import { emptyScene, makeObject } from '../lib/scene'
import type { SceneDocument } from '../types'
import { useSceneDocument } from './useSceneDocument'

const PATH = '/Scenes/Boat.pure3d'
const onDisk = () => JSON.parse(disk.state.text!) as SceneDocument
const named = (scene: SceneDocument) => scene.objects.map(o => o.name).sort()
const object = (name: string) => { const o = makeObject('box'); o.name = name; return o }
const camera = { position: [11, 12, 13] as [number, number, number], target: [1, 2, 3] as [number, number, number], fov: 40 }

const roots: Root[] = []
async function copyOf(held = false) {
  const store = new SceneStore()
  let latest!: ReturnType<typeof useSceneDocument>
  function Probe() {
    latest = useSceneDocument(store, true, { held: () => held })
    return null
  }
  const root = createRoot(document.createElement('div'))
  roots.push(root)
  await act(async () => root.render(<Probe />))
  await act(async () => { await latest.open(PATH) })
  return { store, doc: () => latest }
}
const settle = () => act(async () => { for (let i = 0; i < 30; i += 1) await disk.tick() })
const save = (copy: { doc: () => ReturnType<typeof useSceneDocument> }) => act(async () => { await copy.doc().save() })

beforeAll(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
beforeEach(() => {
  const start = emptyScene()
  start.title = 'Boat'
  start.objects = [object('Hull'), object('Mast')]
  disk.state.text = JSON.stringify(start)
  disk.state.writes = 0
  disk.state.quiet = false
  disk.state.listeners.clear()
  disk.state.lease = { value: null, version: null, count: 0 }
})
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount())
})

describe('saving from a stale view', () => {
  it('both add an object, neither having looked: both survive', async () => {
    disk.state.quiet = true
    const a = await copyOf(), b = await copyOf()
    await act(async () => a.store.edit([{ op: 'add', object: object('From A') }]))
    await save(a)
    await act(async () => b.store.edit([{ op: 'add', object: object('From B') }]))
    await save(b)
    expect(named(onDisk())).toEqual(['From A', 'From B', 'Hull', 'Mast'])
  })

  it('both add at the same moment: both survive', async () => {
    disk.state.quiet = true
    const a = await copyOf(), b = await copyOf()
    await act(async () => {
      a.store.edit([{ op: 'add', object: object('From A') }])
      b.store.edit([{ op: 'add', object: object('From B') }])
      await Promise.all([a.doc().save(), b.doc().save()])
    })
    expect(named(onDisk())).toEqual(['From A', 'From B', 'Hull', 'Mast'])
  })

  it('one deletes an object while the other changes another: it stays deleted', async () => {
    disk.state.quiet = true
    const a = await copyOf(), b = await copyOf()
    const hull = a.store.getSnapshot().scene.objects.find(o => o.name === 'Hull')!
    await act(async () => a.store.edit([{ op: 'delete', id: hull.id }]))
    await save(a)
    await act(async () => b.store.edit([{ op: 'add', object: object('From B') }]))
    await save(b)
    expect(named(onDisk())).toEqual(['From B', 'Mast'])
  })

  it('different changes to one object both stay, and the later one wins a change to the same thing', async () => {
    disk.state.quiet = true
    const a = await copyOf(), b = await copyOf()
    const id = a.store.getSnapshot().scene.objects.find(o => o.name === 'Hull')!.id
    await act(async () => a.store.edit([{ op: 'update', id, patch: { name: 'Hull A', visible: false } }]))
    await save(a)
    await act(async () => b.store.edit([{ op: 'update', id, patch: { name: 'Hull B' } }]))
    await save(b)
    expect(onDisk().objects.find(o => o.id === id)).toMatchObject({ name: 'Hull B', visible: false })
  })

  it('a first title change and an edit from the other copy both stay', async () => {
    disk.state.quiet = true
    const a = await copyOf(), b = await copyOf()
    await act(async () => a.store.edit([{ op: 'settings', title: 'Sloop' }]))
    await save(a)
    await act(async () => b.store.edit([{ op: 'add', object: object('From B') }]))
    await save(b)
    expect(onDisk().title).toBe('Sloop')
    expect(named(onDisk())).toContain('From B')
  })
})

describe('a copy picks up what the other did', () => {
  it('takes it in when the other saves', async () => {
    const a = await copyOf(), b = await copyOf()
    await act(async () => a.store.edit([{ op: 'add', object: object('From A') }]))
    await save(a)
    await settle()
    expect(named(b.store.getSnapshot().scene)).toContain('From A')
  })

  it('keeps its own unsaved change when it takes the other in, and saves both', async () => {
    const a = await copyOf(), b = await copyOf()
    await act(async () => b.store.edit([{ op: 'add', object: object('From B') }]))
    await act(async () => a.store.edit([{ op: 'add', object: object('From A') }]))
    await save(a)
    await settle()
    expect(named(b.store.getSnapshot().scene)).toEqual(expect.arrayContaining(['From A', 'From B']))
    await save(b)
    expect(named(onDisk())).toEqual(['From A', 'From B', 'Hull', 'Mast'])
  })

  it('cannot undo across what the other did', async () => {
    const a = await copyOf(), b = await copyOf()
    await act(async () => b.store.edit([{ op: 'add', object: object('From B') }]))
    await save(b)
    await settle()
    await act(async () => a.store.edit([{ op: 'add', object: object('From A') }]))
    await save(a)
    await settle()
    expect(b.store.getSnapshot().canUndo).toBe(false)
  })
})

describe('a held copy looks around without touching the file', () => {
  it('orbiting writes nothing', async () => {
    const held = await copyOf(true)
    const writes = disk.state.writes
    await act(async () => { held.store.setCamera(camera); held.store.persistCamera() })
    await settle()
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 1600)) })
    expect(disk.state.writes).toBe(writes)
  }, 4000)

  it('leaving after orbiting writes nothing', async () => {
    const held = await copyOf(true)
    const writes = disk.state.writes
    await act(async () => held.store.setCamera(camera))
    await act(async () => roots.pop()!.unmount())
    await settle()
    expect(disk.state.writes).toBe(writes)
    expect(held.store).toBeDefined()
  })

  it('its view is its own: an agent edit there leaves the full app\'s saved camera, and the other\'s change moves no one\'s view', async () => {
    const full = await copyOf(), held = await copyOf(true)
    const saved = full.store.getSnapshot().scene.settings.camera
    await act(async () => held.store.setCamera(camera))
    await act(async () => held.store.edit([{ op: 'add', object: object('From the agent') }]))
    await save(held)
    expect(onDisk().settings.camera.position).toEqual(saved.position)
    await act(async () => full.store.edit([{ op: 'add', object: object('From A') }]))
    await save(full)
    await settle()
    expect(held.store.getCameraSnapshot().position).toEqual(camera.position)
    expect(named(held.store.getSnapshot().scene)).toContain('From A')
  })
})
