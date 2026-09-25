import { describe, expect, it, vi } from 'vitest'
import { createToolHandlers } from './useAppAgentTools'
import { SceneStore } from '../lib/SceneStore'
import { makeObject, emptyScene } from '../lib/scene'
import type { ViewportAPI } from '../components/SceneViewport'
import manifest from '../../plugin.json'
import * as THREE from 'three'
import { readPlatformFileBinaryDataUrl, vision } from '../bridge/platformBridge'

vi.mock('../bridge/platformBridge', async importOriginal => ({
  ...(await importOriginal<typeof import('../bridge/platformBridge')>()),
  readPlatformFileBinaryDataUrl: vi.fn(),
}))

describe('Assistant surface', () => {
  const setup = () => {
    const store = new SceneStore()
    const document = {
      doc: {
        path: null,
        title: '',
        status: 'none' as const,
        savedAt: null,
        saving: false,
        error: null,
      },
      save: vi.fn().mockResolvedValue('/Drafts/Scene.pure3d'),
      open: vi.fn(),
      create: vi.fn(),
    }
    const viewport = { current: null as ViewportAPI | null }
    const handlers = createToolHandlers(store, document, viewport)
    const invoke = (name: keyof typeof handlers, args = {}) =>
      handlers[name]({ shortName: name, toolCallId: 'test', arguments: args })
    return { store, document, viewport, handlers, invoke }
  }
  const mockImageDecoder = () =>
    vi
      .spyOn(THREE.ImageLoader.prototype, 'load')
      .mockImplementation((_url, onLoad) => {
        const image = { width: 2, height: 2 } as HTMLImageElement
        queueMicrotask(() => onLoad?.(image))
        return image
      })
  it('matches the manifest, reads without changing content, and saves consecutive edits directly', async () => {
    const { store, document, handlers, invoke } = setup()
    expect(Object.keys(handlers).sort()).toEqual(
      manifest.app.agents.tools.map(t => t.name).sort(),
    )
    const context = JSON.parse((await invoke('getScene')).content)
    const initial = store.getSnapshot()
    expect(context).not.toHaveProperty('revision')
    expect(context).not.toHaveProperty('documentId')
    for (let i = 0; i < 5; i++) await invoke('getScene')
    expect(store.getSnapshot()).toBe(initial)
    expect(document.save).not.toHaveBeenCalled()
    const edited = JSON.parse(
      (
        await invoke('editScene', {
          operations: [{ op: 'add', object: makeObject() }],
        })
      ).content,
    )
    expect(store.getSnapshot().scene.objects).toHaveLength(1)
    expect(document.save).toHaveBeenCalledTimes(1)
    expect(edited.path).toBe('/Drafts/Scene.pure3d')
    await invoke('editScene', {
      operations: [{ op: 'delete', id: store.getSnapshot().scene.objects[0].id }],
    })
    expect(store.getSnapshot().scene.objects).toHaveLength(0)
    expect(document.save).toHaveBeenCalledTimes(2)
  })
  it('validates arguments and controls transient state without saving', async () => {
    const { store, document, invoke } = setup()
    await expect(
      invoke('setWorkspace', {
        time: -1,
      }),
    ).rejects.toThrow()
    await invoke('setWorkspace', {
      time: 2,
      playing: true,
      loop: false,
      inspector: false,
      mode: 'rotate',
    })
    expect(store.getSnapshot()).toMatchObject({
      time: 2,
      playing: true,
      loop: false,
      inspector: false,
      mode: 'rotate',
    })
    expect(document.save).not.toHaveBeenCalled()
    await expect(invoke('captureViewport')).rejects.toThrow(
      'renderer unavailable',
    )
  })
  it('authors and previews camera shots without altering object animation', async () => {
    const { store, document, invoke } = setup()
    const object = makeObject()
    await invoke('editScene', { operations: [
      { op: 'add', object },
      { op: 'keyframe', keyframe: { objectId: object.id, property: 'position', time: 0, value: [0, 0, 0], easing: 'linear' } },
    ] })
    const before = structuredClone(store.getSnapshot().scene)
    await invoke('editScene', { operations: [{ op: 'cameraKeyframe', keyframe: { time: 0, position: [8, 4, 8], target: [0, 0, 0], fov: 50, easing: 'smooth' } }] })
    const saves = document.save.mock.calls.length
    await invoke('setWorkspace', { cameraPreview: true, time: 0, playing: true })
    const state = store.getSnapshot()
    expect(state.cameraPreview).toBe(true)
    expect(state.scene.cameraKeys).toHaveLength(1)
    expect(state.scene.objects).toEqual(before.objects)
    expect(state.scene.keyframes).toEqual(before.keyframes)
    expect(document.save.mock.calls.length).toBe(saves)
    expect(JSON.stringify(manifest.app.agents.tools.find(t => t.name === 'setWorkspace')?.inputSchema)).toContain('cameraPreview')
    expect(JSON.stringify(manifest.app.agents.tools.find(t => t.name === 'editScene')?.inputSchema)).toContain('cameraKeyframe')
  })
  it('opens and creates documents through the same workflow and reports the resulting binding', async () => {
    const { store, document, invoke } = setup()
    const loaded = emptyScene('Loaded scene')
    document.open.mockImplementation(async (path: string) => {
      store.replace(loaded)
      return path
    })
    const opened = JSON.parse(
      (await invoke('openScene', { path: '/Loaded.pure3d' })).content,
    )
    expect(document.open).toHaveBeenCalledWith('/Loaded.pure3d')
    expect(opened).toMatchObject({
      scene: { id: loaded.id },
      path: '/Loaded.pure3d',
    })
    document.create.mockImplementation(async (title: string) => {
      store.replace(emptyScene(title))
      return '/Drafts/New.pure3d'
    })
    const created = JSON.parse(
      (await invoke('newScene', { title: 'New scene' })).content,
    )
    expect(created.scene.title).toBe('New scene')
    expect(created.path).toBe('/Drafts/New.pure3d')
    await invoke('saveScene', {
      path: '/Copy.pure3d',
    })
    expect(document.save).toHaveBeenLastCalledWith('/Copy.pure3d')
  })
  it('returns viewport images and frames using the viewport operation', async () => {
    const { store, viewport, document, invoke } = setup()
    viewport.current = {
      capture: vi.fn().mockResolvedValue('data:image/png;base64,AQID'),
      frame: vi.fn(),
    }
    const capture = await invoke('captureViewport')
    expect(capture.images).toEqual([{ mimeType: 'image/png', data: 'AQID' }])
    await invoke('setWorkspace', {
      frameSelection: true,
    })
    expect(viewport.current.frame).toHaveBeenCalledTimes(1)
    expect(document.save).toHaveBeenCalledTimes(1)
  })
  it('imports images through the bridge, omits image bytes from context, and edits vertex selection without saving', async () => {
    const { store, document, invoke } = setup()
    const object = makeObject('box')
    store.edit([
      { op: 'add', object },
      { op: 'subdivide', id: object.id },
    ])
    const dataUrl = 'data:image/png;base64,AQID'
    vi.mocked(readPlatformFileBinaryDataUrl).mockResolvedValue(dataUrl)
    const loader = mockImageDecoder()
    try {
      const context = JSON.parse(
        (
          await invoke('importTexture', {
            id: object.id,
            path: '/texture.png',
          })
        ).content,
      )
      expect(readPlatformFileBinaryDataUrl).toHaveBeenCalledWith(
        '/texture.png',
        8 * 1024 * 1024,
      )
      expect(
        store.getSnapshot().scene.textureAssets.find(asset => asset.id === store.getSnapshot().scene.objects[0].material.texture?.assetId)?.dataUrl,
      ).toBe(dataUrl)
      expect(context.scene.objects[0].material.texture.dataUrl).toBeUndefined()
      expect(document.save).toHaveBeenCalledTimes(1)
      await invoke('setWorkspace', {
        selectedId: object.id,
        selectedVertex: 1,
      })
      expect(store.getSnapshot()).toMatchObject({
        selectedVertex: 1,
        mode: 'translate',
        playing: false,
      })
      expect(document.save).toHaveBeenCalledTimes(1)
    } finally {
      loader.mockRestore()
    }
  })
  it('generates and edits textures through the configured image service with undo and saving', async () => {
    const { store, document, invoke } = setup()
    const object = makeObject('box')
    store.edit([{ op: 'add', object }])
    const generated = {
      base64: 'AQID',
      mimeType: 'image/png',
      modelId: 'selected-image-model',
      provider: 'openrouter' as const,
    }
    const generation = vi.spyOn(vision, 'generate').mockResolvedValue(generated)
    const loader = mockImageDecoder()
    try {
      const result = JSON.parse(
        (
          await invoke('generateTexture', {
            id: object.id,
            prompt: 'Seamless stone albedo',
          })
        ).content,
      )
      expect(generation).toHaveBeenNthCalledWith(1, {
        prompt: 'Seamless stone albedo',
        size: '1024x1024',
        quality: 'medium',
        outputFormat: 'png',
        background: 'opaque',
      })
      expect(result).toMatchObject({
        modelId: generated.modelId,
        provider: generated.provider,
        path: '/Drafts/Scene.pure3d',
      })
      expect(result.scene.objects[0].material.texture.dataUrl).toBeUndefined()
      expect(store.getSnapshot().scene.objects[0].material).toMatchObject({
        texture: { dataUrl: 'data:image/png;base64,AQID' },
        color: '#ffffff',
      })
      store.edit([
        {
          op: 'update',
          id: object.id,
          patch: { material: { texture: { repeat: [2, 3] } } },
        },
      ])
      generation.mockResolvedValue({ ...generated, base64: 'BAUG' })
      await invoke('generateTexture', {
        id: object.id,
        prompt: 'Add moss',
        size: '1536x1024',
        editExisting: true,
      })
      expect(generation).toHaveBeenNthCalledWith(2, {
        prompt: 'Add moss',
        size: '1536x1024',
        quality: 'medium',
        outputFormat: 'png',
        background: 'opaque',
        sourceImages: [
          { base64: 'AQID', mimeType: 'image/png', name: 'box texture' },
        ],
      })
      expect(store.getSnapshot().scene.objects[0].material.texture).toEqual({
        dataUrl: 'data:image/png;base64,BAUG',
        repeat: [2, 3],
      })
      expect(document.save).toHaveBeenCalledTimes(2)
      store.history('undo')
      expect(
        store.getSnapshot().scene.textureAssets.find(asset => asset.id === store.getSnapshot().scene.objects[0].material.texture?.assetId)?.dataUrl,
      ).toBe('data:image/png;base64,AQID')
    } finally {
      generation.mockRestore()
      loader.mockRestore()
    }
  })
  it('validates generation, preserves other edits, propagates provider failure, and retries saving without regeneration', async () => {
    const { store, document, invoke } = setup()
    const object = makeObject('box')
    const group = makeObject('group')
    store.edit([
      { op: 'add', object },
      { op: 'add', object: group },
    ])
    const generated = {
      base64: 'AQID',
      mimeType: 'image/png',
      modelId: 'selected-image-model',
      provider: 'openrouter' as const,
    }
    const generation = vi
      .spyOn(vision, 'generate')
      .mockRejectedValue(new Error('Provider unavailable'))
    const loader = mockImageDecoder()
    const args = {
      id: object.id,
      prompt: 'Stone texture',
    }
    try {
      await expect(
        invoke('generateTexture', { ...args, id: group.id }),
      ).rejects.toThrow('Select a shape')
      await expect(
        invoke('generateTexture', { ...args, editExisting: true }),
      ).rejects.toThrow('no texture to edit')
      await expect(
        invoke('generateTexture', { ...args, prompt: ' ' }),
      ).rejects.toThrow()
      expect(generation).not.toHaveBeenCalled()
      const before = store.getSnapshot().scene
      await expect(invoke('generateTexture', args)).rejects.toThrow(
        'Provider unavailable',
      )
      expect(generation).toHaveBeenCalledTimes(1)
      expect(store.getSnapshot().scene).toBe(before)
      expect(document.save).not.toHaveBeenCalled()
      generation.mockClear().mockImplementationOnce(async () => {
        store.edit([
          {
            op: 'update',
            id: object.id,
            patch: {
              name: 'Edited during generation',
              material: { roughness: 0.8 },
            },
          },
        ])
        return generated
      })
      await invoke('generateTexture', args)
      expect(store.getSnapshot().scene.objects[0]).toMatchObject({
        name: 'Edited during generation',
        material: {
          roughness: 0.8,
          texture: { dataUrl: 'data:image/png;base64,AQID' },
        },
      })
      expect(document.save).toHaveBeenCalledTimes(1)
      generation.mockClear().mockResolvedValue(generated)
      document.save.mockRejectedValueOnce(new Error('Disk full'))
      await expect(invoke('generateTexture', args)).rejects.toThrow('Disk full')
      expect(
        store.getSnapshot().scene.textureAssets.find(asset => asset.id === store.getSnapshot().scene.objects[0].material.texture?.assetId)?.dataUrl,
      ).toBe('data:image/png;base64,AQID')
      await invoke('saveScene')
      expect(generation).toHaveBeenCalledTimes(1)
    } finally {
      generation.mockRestore()
      loader.mockRestore()
    }
  })
  it('reports a pending shell resource instead of reading or editing the outgoing scene', async () => {
    const { store, document, viewport } = setup()
    const handlers = createToolHandlers(store, document, viewport, {
      path: '/Opening.pure3d',
    })
    await expect(
      handlers.getScene({
        shortName: 'getScene',
        toolCallId: 'pending',
        arguments: {},
      }),
    ).rejects.toThrow('resource is opening')
    await expect(
      handlers.editScene({
        shortName: 'editScene',
        toolCallId: 'pending',
        arguments: {
          operations: [{ op: 'add', object: makeObject() }],
        },
      }),
    ).rejects.toThrow('resource is opening')
    expect(store.getSnapshot().scene.objects).toEqual([])
    expect(document.save).not.toHaveBeenCalled()
  })
  it('reuses retained texture assets and bulk-patches inherited or recursive bindings atomically', async () => {
    const { store, document, invoke } = setup()
    const group = makeObject('group')
    const child = makeObject()
    const nested = makeObject()
    child.parentId = group.id
    nested.parentId = child.id
    store.edit([
      {
        op: 'addTextureAsset',
        asset: { id: 'stone', dataUrl: 'data:image/png;base64,AQID' },
      },
      {
        op: 'addTextureAsset',
        asset: { id: 'moss', dataUrl: 'data:image/png;base64,BAUG' },
      },
      { op: 'add', object: group },
      { op: 'add', object: child },
      { op: 'add', object: nested },
    ])
    const applied = JSON.parse(
      (
        await invoke('applyTexture', {
          assetId: 'stone',
          objectIds: [group.id],
        })
      ).content,
    )
    expect(applied.appliedObjectIds).toEqual([group.id])
    expect(applied.scene.textureAssets[0].dataUrl).toBeUndefined()
    expect(store.getSnapshot().scene.objects[0].material.texture).toEqual({
      assetId: 'stone',
    })
    expect(store.getSnapshot().scene.objects[1].material.texture).toBeUndefined()
    const patched = JSON.parse(
      (
        await invoke('patchTextures', {
          objectIds: [group.id],
          patch: { color: '#112233', repeat: [2, 3], wrapS: 'mirror' },
        })
      ).content,
    )
    expect(patched.patchedObjectIds).toEqual([group.id])
    expect(store.getSnapshot().scene.objects[0].material).toMatchObject({
      color: '#112233',
      texture: { assetId: 'stone', repeat: [2, 3], wrapS: 'mirror' },
    })
    const recursive = await invoke('applyTexture', {
      assetId: 'moss',
      objectIds: [group.id],
      recursive: true,
    })
    expect(JSON.parse(recursive.content).appliedObjectIds).toEqual([
      group.id,
      child.id,
      nested.id,
    ])
    expect(store.getSnapshot().scene.objects.map(object => object.material.texture?.assetId)).toEqual([
      'moss',
      'moss',
      'moss',
    ])
    const before = store.getSnapshot().scene
    await expect(
      invoke('patchTextures', {
        objectIds: [child.id, 'missing'],
        patch: { rotation: 0.5 },
      }),
    ).rejects.toThrow('Unknown object: missing')
    expect(store.getSnapshot().scene).toBe(before)
    expect(document.save).toHaveBeenCalledTimes(3)
  })
})
