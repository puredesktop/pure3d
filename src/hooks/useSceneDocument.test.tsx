// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type {
  PlatformDocumentCreateDraftRequest,
  PlatformDocumentFilePayload,
} from '@purescience/platform-ui/bridge/documents'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

const documents = vi.hoisted(() => ({
  autosavePlatformDocument: vi.fn(
    async (_request: {
      path: string
      files: PlatformDocumentFilePayload[]
    }) => ({
      savedAt: '2026-09-17T00:00:00.000Z',
    }),
  ),
  createPlatformDraft: vi.fn(
    async (_request: PlatformDocumentCreateDraftRequest) => ({
      path: '/Drafts/Scene.pure3d',
    }),
  ),
  duplicatePlatformDocument: vi.fn(),
  promotePlatformDocument: vi.fn(),
  renamePlatformDocument: vi.fn(),
  touchPlatformRecentDocument: vi.fn(),
  onPlatformDocumentsChanged: vi.fn(() => () => undefined),
}))
const files = vi.hoisted(() => ({
  readPlatformTextFile: vi.fn(),
  writePlatformTextFile: vi.fn(),
}))
const events = vi.hoisted(() => {
  const handlers = new Map<string, (payload: unknown) => void>()
  return {
    handlers,
    bridge: {
      onEvent: vi.fn((name: string, fn: (payload: unknown) => void) => {
        handlers.set(name, fn)
        return () => handlers.delete(name)
      }),
      call: vi.fn(async () => ({ ok: true })),
    },
  }
})
vi.mock('@purescience/platform-ui/bridge/documents', () => documents)
vi.mock('@purescience/platform-ui/bridge/fs', () => files)
vi.mock('@purescience/platform-ui/bridge/client', () => ({
  bridge: events.bridge,
}))

import { PLATFORM_BRIDGE_EVENTS as E } from '@purescience/platform-ui/bridge/events'
import { PLATFORM_BRIDGE_METHODS as M } from '@purescience/platform-ui/bridge/methods'
import { SceneStore } from '../lib/SceneStore'
import { emptyScene, makeObject } from '../lib/scene'
import { useSceneDocument } from './useSceneDocument'

describe('Scene document integration with the shared lifecycle', () => {
  let store: SceneStore
  let root: Root
  let host: HTMLDivElement
  let latest: ReturnType<typeof useSceneDocument>
  function Probe() {
    latest = useSceneDocument(store, true)
    return null
  }
  async function settle() {
    await act(async () => {
      for (let i = 0; i < 8; i++) await Promise.resolve()
    })
  }

  beforeAll(() => {
    ;(
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
  })
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    events.handlers.clear()
    documents.touchPlatformRecentDocument.mockResolvedValue(undefined)
    store = new SceneStore()
    host = document.createElement('div')
    root = createRoot(host)
    await act(async () => root.render(<Probe />))
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    vi.useRealTimers()
  })

  it('autosaves content edits and history, while selection and playback stay transient', async () => {
    await act(async () => {
      store.workspace({ time: 2, playing: true })
      store.tick(1)
    })
    expect(documents.createPlatformDraft).not.toHaveBeenCalled()
    expect(documents.autosavePlatformDocument).not.toHaveBeenCalled()
    const object = makeObject()
    object.material.texture = {
      dataUrl: 'data:image/png;base64,AQID',
      repeat: [2, 3],
    } as never
    await act(async () => store.edit([{ op: 'add', object }]))
    await settle()
    expect(documents.createPlatformDraft).toHaveBeenCalledTimes(1)
    expect(documents.createPlatformDraft.mock.calls[0]![0]).toMatchObject({
      appSlug: '3d',
      suffix: '.pure3d',
      kind: 'file',
    })
    await act(async () => vi.advanceTimersByTimeAsync(1500))
    const saved = documents.autosavePlatformDocument.mock.calls[0]![0]
    expect(saved.path).toBe('/Drafts/Scene.pure3d')
    expect(JSON.parse(saved.files[0].content).objects[0].id).toBe(object.id)
    expect(
      JSON.parse(saved.files[0].content).objects[0].material.texture,
    ).toEqual(object.material.texture)
    await act(async () => store.history('undo'))
    await act(async () => vi.advanceTimersByTimeAsync(1500))
    expect(
      JSON.parse(
        documents.autosavePlatformDocument.mock.calls[1]![0].files[0].content,
      ).objects,
    ).toEqual([])
  })
  it('coalesces camera persistence while selection and live camera updates stay clean', async () => {
    await act(async () => {
      store.workspace({ selectedId: null })
      store.setCamera({ position: [9, 6, 8], target: [1, 0, 0] })
    })
    await settle()
    expect(documents.createPlatformDraft).not.toHaveBeenCalled()
    expect(documents.autosavePlatformDocument).not.toHaveBeenCalled()

    await act(async () => store.persistCamera())
    await settle()
    expect(documents.createPlatformDraft).toHaveBeenCalledTimes(1)
    await act(async () => vi.advanceTimersByTimeAsync(1500))
    expect(JSON.parse(documents.autosavePlatformDocument.mock.calls[0]![0].files[0].content)
      .settings.camera).toEqual({ position: [9, 6, 8], target: [1, 0, 0] })
    expect(store.getSnapshot().canUndo).toBe(false)
  })
  it('flushes the outgoing content before adopting an opened document, without autosaving a clean load', async () => {
    const outgoing = store.getSnapshot().scene.id
    await act(async () => latest.lifecycle.adopt('/Old.pure3d'))
    await act(async () => store.edit([{ op: 'add', object: makeObject() }]))
    const incoming = emptyScene('Incoming')
    files.readPlatformTextFile.mockResolvedValue(JSON.stringify(incoming))
    await act(async () => {
      await latest.open('/Incoming.pure3d')
    })
    const saved = documents.autosavePlatformDocument.mock.calls[0]![0]
    expect(saved.path).toBe('/Old.pure3d')
    expect(JSON.parse(saved.files[0].content)).toMatchObject({
      id: outgoing,
      objects: [expect.anything()],
    })
    expect(latest.doc.path).toBe('/Incoming.pure3d')
    expect(store.getSnapshot().scene.id).toBe(incoming.id)
    await act(async () => vi.advanceTimersByTimeAsync(2000))
    expect(documents.autosavePlatformDocument).toHaveBeenCalledTimes(1)
  })
  it('keeps the current scene and binding when outgoing saving or incoming parsing fails', async () => {
    await act(async () => latest.lifecycle.adopt('/Old.pure3d'))
    const outgoing = store.getSnapshot().scene
    files.readPlatformTextFile.mockResolvedValue(JSON.stringify(emptyScene()))
    documents.autosavePlatformDocument.mockRejectedValueOnce(
      new Error('disk full'),
    )
    await act(async () => {
      await expect(latest.open('/New.pure3d')).rejects.toThrow('disk full')
    })
    expect(store.getSnapshot().scene).toBe(outgoing)
    expect(latest.doc.path).toBe('/Old.pure3d')
    files.readPlatformTextFile.mockResolvedValue('{}')
    await act(async () => {
      await expect(latest.open('/Broken.pure3d')).rejects.toThrow()
    })
    expect(store.getSnapshot().scene).toBe(outgoing)
    expect(documents.autosavePlatformDocument).toHaveBeenCalledTimes(1)
  })
  it('writes Save As through the filesystem helper and lets the lifecycle own the new binding', async () => {
    await act(async () => latest.lifecycle.adopt('/Old.pure3d'))
    await act(async () => store.edit([{ op: 'add', object: makeObject() }]))
    await act(async () => {
      expect(await latest.save('/Copy.pure3d')).toBe('/Copy.pure3d')
    })
    expect(files.writePlatformTextFile).toHaveBeenCalledWith(
      '/Copy.pure3d',
      JSON.stringify(store.getSnapshot().scene, null, 2),
    )
    expect(latest.doc.path).toBe('/Copy.pure3d')
    expect(store.getSnapshot()).not.toHaveProperty('path')
    expect(store.getSnapshot()).not.toHaveProperty('savedRevision')
    expect(store.getSnapshot()).not.toHaveProperty('saveStatus')
    await act(async () => {
      await expect(latest.save('/Bad.obj')).rejects.toThrow('.pure3d')
    })
    expect(files.writePlatformTextFile).toHaveBeenCalledTimes(1)
  })
  it('uses the shared close handshake to save current scene content before acknowledging', async () => {
    await act(async () => latest.lifecycle.adopt('/Scene.pure3d'))
    await act(async () => store.edit([{ op: 'add', object: makeObject() }]))
    await act(async () =>
      events.handlers.get(E.WORKSPACE_WILL_CLOSE)!({ requestId: 'close-3d' }),
    )
    await settle()
    expect(
      JSON.parse(
        documents.autosavePlatformDocument.mock.calls[0]![0].files[0].content,
      ).objects,
    ).toHaveLength(1)
    expect(events.bridge.call).toHaveBeenCalledWith(M.WORKSPACE_CLOSE_READY, [
      { requestId: 'close-3d' },
    ])
    expect(
      documents.autosavePlatformDocument.mock.invocationCallOrder[0],
    ).toBeLessThan(events.bridge.call.mock.invocationCallOrder[0]!)
  })
})
