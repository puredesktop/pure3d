import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import manifest from '../../plugin.json'
import { vision } from '../bridge/platformBridge'
import type { ViewportAPI } from '../components/SceneViewport'
import { createToolHandlers } from '../hooks/useAppAgentTools'
import { SceneStore } from '../lib/SceneStore'
import { emptyScene, makeObject } from '../lib/scene'
import { toolDefinitions } from '../lib/schemas.mjs'
import { PURE3D_ATOMIC_TOOL_SCHEMAS } from './atomicToolSchemas'
import {
  EXPOSED_TOOL_NAMES,
  PURE3D_ALL_ATOMIC_TOOL_NAMES,
  PURE3D_CORE_TOOL_NAMES,
  PURE3D_EXTENDED_TOOL_NAMES,
  PURE3D_FUNCTION_NAMES,
  PURE3D_META_TOOL_NAMES,
} from './catalog'
import {
  buildPure3DHandlers,
  PURE3D_OPERATIONS_REGISTRY,
} from './operationsRegistry'

const RELEASE_VERBS = ['send', 'merge', 'publish', 'deposit', 'deploy', 'post']

function createHarness(options?: { withViewport?: boolean }) {
  const store = new SceneStore()
  const document = {
    doc: {
      path: '/Scenes/Studio.pure3d' as string | null,
      title: 'Studio',
      status: 'filed' as const,
      savedAt: null,
      saving: false,
      error: null,
    },
    save: vi.fn(async (path?: string) => path ?? '/Scenes/Studio.pure3d'),
    open: vi.fn(async (path: string) => {
      store.replace(emptyScene('Opened Scene'))
      return path
    }),
    create: vi.fn(async (title?: string) => {
      store.replace(emptyScene(title ?? 'Fresh Scene'))
      return '/Drafts/Fresh.pure3d'
    }),
  }

  const shotMock = vi.fn(
    (spec: { azimuth?: number; elevation?: number; position?: [number, number, number]; target?: [number, number, number]; fov?: number }) => {
      if (spec.position && spec.target) {
        return {
          position: spec.position,
          target: spec.target,
          fov: spec.fov ?? 45,
        }
      }
      const az = spec.azimuth ?? 35
      return {
        position: [Math.round(Math.sin((az * Math.PI) / 180) * 10 * 100) / 100, 3, Math.round(Math.cos((az * Math.PI) / 180) * 10 * 100) / 100] as [number, number, number],
        target: [0, 1, 0] as [number, number, number],
        fov: spec.fov ?? 35,
        ...(az === 180 ? { blockedBy: ['wall-1'] } : {}),
      }
    },
  )

  const viewportApi: ViewportAPI = {
    capture: vi.fn().mockResolvedValue('data:image/png;base64,AQID'),
    frame: vi.fn(),
    shot: shotMock,
    aspect: vi.fn(() => 16 / 9),
  }

  const viewport = {
    current: (options?.withViewport ?? true) ? viewportApi : null,
  }

  const recorded: Array<{ kind: string; summary: string }> = []
  const handlers = buildPure3DHandlers(
    () => ({ store, document, viewport, resource: null }),
    {
      recordOperation: (_ctx, kind, summary) => {
        recorded.push({ kind, summary })
      },
    },
  )

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const handler = handlers[name]
    if (!handler) throw new Error(`No exposed handler for "${name}"`)
    const result = await handler({
      shortName: name,
      toolCallId: `test-${name}`,
      arguments: args,
    })
    return {
      raw: result,
      json: JSON.parse(result.content),
    }
  }

  return { store, document, viewport, viewportApi, shotMock, handlers, recorded, call }
}

afterEach(() => vi.restoreAllMocks())

describe('Pure3D Operations Registry invariants & plugin.json sync', () => {
  it('matches catalog lists, audit summary, and 100% lossless atomic tool coverage', () => {
    const summary = PURE3D_OPERATIONS_REGISTRY.auditSummary()
    expect(summary).toEqual({
      appSlug: '3d',
      functions: 5,
      coreTools: 4,
      extendedTools: 10,
      metaTools: 3,
      totalExposed: 12,
      totalAtomicTools: 14,
      totalRegistered: 19,
      schemaReductionPercent: 14,
    })

    expect(PURE3D_OPERATIONS_REGISTRY.exposedToolNames).toEqual([
      ...EXPOSED_TOOL_NAMES,
    ])
    expect(PURE3D_OPERATIONS_REGISTRY.functions.map(f => f.name)).toEqual([
      ...PURE3D_FUNCTION_NAMES,
    ])
    expect(PURE3D_OPERATIONS_REGISTRY.coreTools.map(t => t.name)).toEqual([
      ...PURE3D_CORE_TOOL_NAMES,
    ])
    expect(PURE3D_OPERATIONS_REGISTRY.extendedToolNames).toEqual([
      ...PURE3D_EXTENDED_TOOL_NAMES,
    ])
    expect(
      [...PURE3D_OPERATIONS_REGISTRY.allAtomicToolNames].sort(),
    ).toEqual([...PURE3D_ALL_ATOMIC_TOOL_NAMES].sort())
    expect(
      [...PURE3D_ATOMIC_TOOL_SCHEMAS.map(s => s.name)].sort(),
    ).toEqual(Object.keys(toolDefinitions).sort())
    expect([...PURE3D_META_TOOL_NAMES]).toEqual([
      'discoverAppTools',
      'callExtendedReadTool',
      'callExtendedTool',
    ])
  })

  it('keeps plugin.json app.agents.tools synced 1:1 with registry.manifestTools', () => {
    expect(manifest.app.agents.tools).toEqual(
      PURE3D_OPERATIONS_REGISTRY.manifestTools,
    )
  })

  it('satisfies manifest quality gates (descriptions >= 80 chars, explicit requiresApproval, no release-verb fn_*)', () => {
    for (const entry of PURE3D_OPERATIONS_REGISTRY.manifestTools) {
      expect(
        entry.description.trim().replace(/\s+/g, ' ').length,
        entry.name,
      ).toBeGreaterThanOrEqual(80)
      expect(typeof entry.requiresApproval, entry.name).toBe('boolean')
      expect(['read', 'write', 'destructive', 'external', 'release']).toContain(
        entry.risk,
      )
    }

    for (const fn of PURE3D_OPERATIONS_REGISTRY.functions) {
      expect(fn.name.startsWith('fn_')).toBe(true)
      const firstNameWord = fn.name
        .replace(/^fn_/, '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .split(/[^A-Za-z]+/)[0]
        ?.toLowerCase()
      const firstDescWord = fn.description
        .trim()
        .split(/[^A-Za-z]+/)[0]
        ?.toLowerCase()
      for (const verb of RELEASE_VERBS) {
        expect(firstNameWord).not.toBe(verb)
        expect(firstDescWord).not.toBe(verb)
      }
    }
  })

  it('wires createToolHandlers to expose exactly EXPOSED_TOOL_NAMES', () => {
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
      save: vi.fn(),
      open: vi.fn(),
      create: vi.fn(),
    }
    const handlers = createToolHandlers(store, document, { current: null })
    expect(Object.keys(handlers)).toEqual([...EXPOSED_TOOL_NAMES])
  })
})

describe('Escape-hatch meta-tools (discoverAppTools, callExtendedReadTool, callExtendedTool)', () => {
  it('discovers extended tools by query, category, and exact name with full lossless schemas', async () => {
    const { call } = createHarness()

    const allExtended = await call('discoverAppTools', {})
    expect(allExtended.json.appSlug).toBe('3d')
    expect(allExtended.json.totalMatched).toBe(10)
    expect(allExtended.json.categories).toEqual([
      'assets',
      'documents',
      'editing',
      'textures',
    ])

    const textureSearch = await call('discoverAppTools', {
      category: 'textures',
    })
    expect(
      textureSearch.json.operations.map((o: { name: string }) => o.name),
    ).toEqual([
      'applyTexture',
      'generateTexture',
      'importTexture',
      'patchTextures',
    ])

    const described = await call('discoverAppTools', {
      names: ['editScene', 'exportModel', 'doesNotExist'],
    })
    expect(described.json.mode).toBe('describe')
    expect(described.json.operations[0]).toMatchObject({
      name: 'editScene',
      found: true,
      exposure: 'extended',
      invokeVia: 'callExtendedTool',
    })
    expect(
      JSON.stringify(described.json.operations[0].inputSchema),
    ).toContain('cameraKeyframe')
    expect(described.json.operations[1]).toMatchObject({
      name: 'exportModel',
      found: true,
      invokeVia: 'callExtendedTool',
    })
    expect(described.json.operations[2]).toMatchObject({
      name: 'doesNotExist',
      found: false,
    })

    const withFunctions = await call('discoverAppTools', {
      query: 'lighting',
      includeFunctions: true,
    })
    expect(
      withFunctions.json.operations.some(
        (o: { name: string }) => o.name === 'fn_setupLightingAndLook',
      ),
    ).toBe(true)
  })

  it('routes extended mutating tools via callExtendedTool and records operations', async () => {
    const { store, document, recorded, call } = createHarness()
    const box = { ...makeObject('box', 'Crate'), id: 'crate-1' }

    const res = await call('callExtendedTool', {
      tool: 'editScene',
      arguments: {
        operations: [{ op: 'add', object: box }],
      },
    })
    expect(res.json).toMatchObject({
      ok: true,
      operations: 1,
      changes: { added: ['crate-1'] },
    })
    expect(store.getSnapshot().scene.objects).toHaveLength(1)
    expect(document.save).toHaveBeenCalledTimes(1)
    expect(recorded).toContainEqual({
      kind: 'extended.editScene',
      summary: 'Executed extended tool editScene',
    })

    const saved = await call('callExtendedTool', {
      tool: 'saveScene',
      arguments: { path: '/Exports/Copy.pure3d' },
    })
    expect(saved.json).toMatchObject({
      ok: true,
      path: '/Exports/Copy.pure3d',
    })
  })

  it('enforces strict refusals on callExtendedReadTool and callExtendedTool', async () => {
    const { call } = createHarness()

    // callExtendedReadTool refuses mutating extended tools
    await expect(
      call('callExtendedReadTool', { tool: 'editScene', arguments: {} }),
    ).rejects.toThrow('cannot run through callExtendedReadTool')

    // callExtendedReadTool refuses directly exposed tools
    await expect(
      call('callExtendedReadTool', { tool: 'getScene', arguments: {} }),
    ).rejects.toThrow('already directly exposed')

    // callExtendedReadTool refuses unknown tools
    await expect(
      call('callExtendedReadTool', { tool: 'unknownTool', arguments: {} }),
    ).rejects.toThrow('Unknown extended tool')

    // callExtendedTool refuses directly exposed tools & composite functions
    await expect(
      call('callExtendedTool', { tool: 'setWorkspace', arguments: {} }),
    ).rejects.toThrow('already directly exposed')
    await expect(
      call('callExtendedTool', { tool: 'fn_composeScene', arguments: {} }),
    ).rejects.toThrow('already directly exposed')

    // callExtendedTool refuses unknown tools & invalid argument shapes
    await expect(
      call('callExtendedTool', { tool: 'nonExistent', arguments: {} }),
    ).rejects.toThrow('Unknown extended tool')
    await expect(
      call('callExtendedTool', {
        tool: 'editScene',
        arguments: ['not-an-object'] as unknown as Record<string, unknown>,
      }),
    ).rejects.toThrow('"arguments" must be a JSON object')
  })

  it('blocks direct functions, core tools, and extended tools while a resource is opening', async () => {
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
      save: vi.fn(),
      open: vi.fn(),
      create: vi.fn(),
    }
    const handlers = createToolHandlers(
      store,
      document,
      { current: null },
      { path: '/Incoming.pure3d' },
    )

    await expect(
      handlers.fn_inspectSceneHealth({
        shortName: 'fn_inspectSceneHealth',
        toolCallId: '1',
        arguments: {},
      }),
    ).rejects.toThrow('resource is opening')
    await expect(
      handlers.discoverAppTools({
        shortName: 'discoverAppTools',
        toolCallId: '2',
        arguments: {},
      }),
    ).rejects.toThrow('resource is opening')
    await expect(
      handlers.callExtendedTool({
        shortName: 'callExtendedTool',
        toolCallId: '3',
        arguments: { tool: 'saveScene', arguments: {} },
      }),
    ).rejects.toThrow('resource is opening')
  })
})

describe('Composite Pure3D App Functions (fn_*)', () => {
  it('fn_inspectSceneHealth audits scene health, warnings, focus objects, and on-demand catalogs without mutating', async () => {
    const { store, document, call } = createHarness()

    const emptyAudit = await call('fn_inspectSceneHealth', {})
    expect(emptyAudit.json.opClass).toBe('function')
    expect(emptyAudit.json.function).toBe('fn_inspectSceneHealth')
    expect(
      emptyAudit.json.data.warnings.some(
        (w: { code: string }) => w.code === 'empty-scene',
      ),
    ).toBe(true)

    const plainBox = { ...makeObject('box', 'Hero Box'), id: 'hero-box' }
    const badScatter = {
      ...makeObject('scatter', 'Pine Woods'),
      id: 'woods-1',
      params: { ...makeObject('scatter').params, on: 'missing-terrain' },
    }
    store.edit([
      {
        op: 'addTextureAsset',
        asset: { id: 'orphan-tex', dataUrl: 'data:image/png;base64,AQID' },
      },
      { op: 'add', object: plainBox },
      { op: 'add', object: badScatter },
      {
        op: 'settings',
        settings: {
          grid: true,
          look: { environment: 'night' },
        },
      },
    ])

    const audit = await call('fn_inspectSceneHealth', {
      focusIds: ['hero-box', 'missing-id'],
      includeCatalog: 'all',
    })
    const codes = audit.json.data.warnings.map(
      (w: { code: string }) => w.code,
    )
    expect(codes).toEqual(
      expect.arrayContaining([
        'grid-enabled',
        'unlit-night-scene',
        'plain-materials',
        'broken-scatter-terrain',
        'orphaned-textures',
      ]),
    )
    expect(audit.json.data.focusedObjects).toHaveLength(1)
    expect(audit.json.data.focusedObjects[0].id).toBe('hero-box')
    expect(audit.json.data.missingFocusIds).toEqual(['missing-id'])
    expect(audit.json.data.catalog.generators).toHaveProperty('building')
    expect(audit.json.data.catalog.kitModels.length).toBeGreaterThan(10)
    expect(audit.json.data.catalog.materialPresets).toHaveProperty('gold')
    expect(audit.json.data.catalog.surfaces).toHaveProperty('stone')
    // Must never leak embedded texture dataUrl bytes
    expect(JSON.stringify(audit.json)).not.toContain('base64')
    expect(document.save).not.toHaveBeenCalled()
  })

  it('fn_composeScene builds, updates, deletes, configures settings, frames camera, and saves atomically', async () => {
    const { store, document, shotMock, recorded, call } = createHarness()

    const composed = await call('fn_composeScene', {
      resetScene: true,
      title: 'Lakeside Cabin',
      add: [
        {
          id: 'ground',
          name: 'Meadow',
          kind: 'terrain',
          params: { width: 40, depth: 40, clearing: 8 },
        },
        {
          id: 'cabin',
          name: 'Cabin',
          kind: 'building',
          position: [0, 0, 0],
          params: { siding: 'log', porch: 'front', windowGlow: 1.5 },
        },
        {
          id: 'barrel-prop',
          name: 'Barrel',
          kind: 'model',
          position: [4, 0, 2],
          params: { name: 'barrel' },
        },
        {
          id: 'temp-box',
          name: 'Temp',
          kind: 'box',
          position: [1, 1, 1],
          material: { preset: 'gold' },
        },
      ],
      settings: { grid: false, duration: 8 },
      selectId: 'cabin',
      shot: { objectIds: ['cabin'], azimuth: 30, elevation: 15, fov: 35 },
    })

    expect(composed.json.ok).toBe(true)
    expect(composed.json.data.scene.title).toBe('Lakeside Cabin')
    expect(composed.json.data.addedIds).toEqual([
      'ground',
      'cabin',
      'barrel-prop',
      'temp-box',
    ])
    expect(composed.json.data.camera).toBeDefined()
    expect(shotMock).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot().selectedId).toBe('cabin')
    expect(store.getSnapshot().scene.settings.grid).toBe(false)
    expect(store.getSnapshot().scene.settings.duration).toBe(8)
    expect(document.save).toHaveBeenCalledTimes(1)
    expect(recorded[0]?.kind).toBe('function.fn_composeScene')

    // Now update + delete in one call
    const edited = await call('fn_composeScene', {
      updates: [
        {
          id: 'cabin',
          position: [0, 0, -2],
          params: { windowGlow: 2.2 },
        },
      ],
      removeIds: ['temp-box'],
    })
    expect(edited.json.data.changes.updated).toEqual(['cabin'])
    expect(edited.json.data.changes.removed).toEqual(['temp-box'])
    expect(store.getSnapshot().scene.objects).toHaveLength(3)

    // Validation errors
    await expect(call('fn_composeScene', {})).rejects.toThrow(
      'Provide at least one scene change',
    )
    await expect(
      call('fn_composeScene', { add: [{ kind: 'mesh' }] }),
    ).rejects.toThrow('Unsupported object kind')
  })

  it('fn_setupLightingAndLook applies presets, studio 3-point rig, custom lights, and custom look overrides in 1 save', async () => {
    const { store, document, call } = createHarness()

    const res = await call('fn_setupLightingAndLook', {
      preset: 'studio-product',
      addStudioRig: true,
      studioTarget: [0, 0.8, 0],
      look: { exposure: 1.2, bloom: 0.2 },
      lights: [
        {
          id: 'accent-spot',
          name: 'Accent Spot',
          type: 'spot',
          position: [2, 3, 2],
          target: [0, 0.8, 0],
          color: '#ffe0b2',
          intensity: 2.5,
          angle: 28,
          softness: 0.5,
        },
      ],
      shot: { azimuth: 25, elevation: 12, fov: 28 },
    })

    expect(res.json.ok).toBe(true)
    expect(res.json.data.preset).toBe('studio-product')
    expect(res.json.data.backdropId).toBe('studio-backdrop')
    expect(res.json.data.lightIds).toEqual([
      'studio-key-light',
      'studio-fill-light',
      'studio-rim-light',
      'accent-spot',
    ])
    expect(res.json.data.look.environment).toBe('studio')
    expect(res.json.data.look.exposure).toBe(1.2)
    expect(res.json.data.look.bloom).toBe(0.2)
    expect(res.json.data.grid).toBe(false)
    expect(res.json.data.camera).toBeDefined()
    expect(document.save).toHaveBeenCalledTimes(1)

    // Re-running updates existing rig lights in place instead of duplicating IDs
    await call('fn_setupLightingAndLook', {
      preset: 'golden-hour',
      addStudioRig: true,
      studioTarget: [1, 1, 1],
    })
    const ids = store.getSnapshot().scene.objects.map(o => o.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(store.getSnapshot().scene.settings.look?.environment).toBe('sky')
  })

  it('fn_styleMaterialsAndTextures batch-styles by kind/name/ids, binds retained textures, and generates+shares textures', async () => {
    const { store, document, call } = createHarness()
    const group = { ...makeObject('group', 'Arch Group'), id: 'arch-group' }
    const pillarA = {
      ...makeObject('cylinder', 'Marble Pillar A'),
      id: 'pillar-a',
      parentId: 'arch-group',
    }
    const pillarB = {
      ...makeObject('cylinder', 'Marble Pillar B'),
      id: 'pillar-b',
      parentId: 'arch-group',
    }
    const base = { ...makeObject('box', 'Stone Plinth'), id: 'plinth' }
    store.edit([
      {
        op: 'addTextureAsset',
        asset: { id: 'stone-tex', dataUrl: 'data:image/png;base64,AQID' },
      },
      { op: 'add', object: group },
      { op: 'add', object: pillarA },
      { op: 'add', object: pillarB },
      { op: 'add', object: base },
    ])

    const styled = await call('fn_styleMaterialsAndTextures', {
      assignments: [
        {
          kinds: ['cylinder'],
          material: { preset: 'marble', roughness: 0.14 },
        },
        {
          objectIds: ['plinth'],
          material: { surface: 'stone', roughness: 0.85 },
          textureAssetId: 'stone-tex',
          texturePatch: { repeat: [2, 2], wrapS: 'repeat' },
        },
      ],
    })

    expect(styled.json.ok).toBe(true)
    expect(styled.json.data.styledObjectIds.sort()).toEqual([
      'pillar-a',
      'pillar-b',
      'plinth',
    ])
    const objs = new Map(store.getSnapshot().scene.objects.map(o => [o.id, o]))
    expect(objs.get('pillar-a')?.material).toMatchObject({
      preset: 'marble',
      roughness: 0.14,
    })
    expect(objs.get('plinth')?.material.texture).toMatchObject({
      assetId: 'stone-tex',
      repeat: [2, 2],
      wrapS: 'repeat',
    })
    expect(document.save).toHaveBeenCalledTimes(1)

    // Test AI texture generation + sharing across multiple objects
    const genSpy = vi.spyOn(vision, 'generate').mockResolvedValue({
      base64: 'BAUG',
      mimeType: 'image/png',
      modelId: 'test-img-model',
      provider: 'openrouter',
    })
    const loaderSpy = vi
      .spyOn(THREE.ImageLoader.prototype, 'load')
      .mockImplementation((_url, onLoad) => {
        const image = { width: 4, height: 4 } as HTMLImageElement
        queueMicrotask(() => onLoad?.(image))
        return image
      })
    try {
      const generated = await call('fn_styleMaterialsAndTextures', {
        generateTexture: {
          objectId: 'pillar-a',
          prompt: 'Seamless fluted white marble',
          applyToObjectIds: ['pillar-b'],
          texturePatch: { repeat: [3, 1] },
        },
      })
      expect(genSpy).toHaveBeenCalledTimes(1)
      expect(generated.json.data.generatedTexture).toMatchObject({
        assetId: expect.any(String),
        modelId: 'test-img-model',
        provider: 'openrouter',
      })
      expect(JSON.stringify(generated.json)).not.toContain('base64')
      const updated = new Map(
        store.getSnapshot().scene.objects.map(o => [o.id, o]),
      )
      const assetId = generated.json.data.generatedTexture.assetId
      expect(updated.get('pillar-a')?.material.texture).toMatchObject({
        assetId,
        repeat: [3, 1],
      })
      expect(updated.get('pillar-b')?.material.texture).toMatchObject({
        assetId,
        repeat: [3, 1],
      })
    } finally {
      genSpy.mockRestore()
      loaderSpy.mockRestore()
    }
  })

  it('fn_directCameraAndShots authors hero shot, smooth orbit keyframes, occlusion warnings, preview playback & PNG captures', async () => {
    const { store, document, viewportApi, call } = createHarness()
    store.edit([{ op: 'add', object: { ...makeObject('box', 'Subject'), id: 'subj' } }])

    const res = await call('fn_directCameraAndShots', {
      heroShot: { objectIds: ['subj'], azimuth: 35, elevation: 18, fov: 35 },
      orbit: {
        objectIds: ['subj'],
        startAzimuth: 0,
        endAzimuth: 360,
        elevation: 20,
        startTime: 0,
        endTime: 8,
        steps: 5,
        easing: 'smooth',
      },
      cameraPreview: true,
      playing: true,
      time: 0,
      capturePreview: true,
      aspect: '16:9',
      size: 1024,
    })

    expect(res.json.ok).toBe(true)
    expect(store.getSnapshot().scene.settings.duration).toBe(8)
    expect(store.getSnapshot().scene.cameraKeys).toHaveLength(5)
    expect(res.json.data.authoredCameraKeys).toHaveLength(5)
    // Azimuth 180° is mocked as occluded by 'wall-1'
    expect(res.json.data.blockedShots).toEqual([
      { time: 4, blockedBy: ['wall-1'] },
    ])
    expect(store.getSnapshot().cameraPreview).toBe(true)
    expect(store.getSnapshot().playing).toBe(true)
    expect(res.raw.images).toHaveLength(4) // capped at 4 preview stills
    expect(viewportApi.capture).toHaveBeenCalledTimes(4)
    expect(document.save).toHaveBeenCalledTimes(1)

    // Clear existing camera keys and author explicit shot sequence without viewport
    const headless = createHarness({ withViewport: false })
    const explicit = await headless.call('fn_directCameraAndShots', {
      clearExistingKeys: true,
      shots: [
        {
          time: 0,
          shot: { position: [5, 3, 5], target: [0, 1, 0], fov: 40 },
        },
        {
          time: 6,
          shot: { position: [-5, 4, 5], target: [0, 1, 0], fov: 35 },
        },
      ],
    })
    expect(explicit.json.data.authoredCameraKeys).toHaveLength(2)
    expect(headless.store.getSnapshot().scene.settings.duration).toBe(6)
    expect(headless.document.save).toHaveBeenCalledTimes(1)
  })

  it('enforces atomic validation and edge-case guards across all composite functions', async () => {
    // 1. fn_inspectSceneHealth rejects unknown includeCatalog
    const h1 = createHarness()
    await expect(
      h1.call('fn_inspectSceneHealth', { includeCatalog: 'bogus' }),
    ).rejects.toThrow('Unknown includeCatalog')

    // 2. fn_composeScene preserves existing scene when resetScene: true fails validation
    const existingBox = { ...makeObject('box', 'Keep Me'), id: 'keep-me' }
    h1.store.edit([{ op: 'add', object: existingBox }])
    const beforeReset = h1.store.getSnapshot().scene
    await expect(
      h1.call('fn_composeScene', {
        resetScene: true,
        add: [
          { id: 'dup', kind: 'box' },
          { id: 'dup', kind: 'sphere' },
        ],
      }),
    ).rejects.toThrow()
    expect(h1.store.getSnapshot().scene).toBe(beforeReset)
    await expect(
      h1.call('fn_composeScene', {
        resetScene: true,
        add: [{ id: 'fresh', kind: 'box' }],
        selectId: 'does-not-exist',
      }),
    ).rejects.toThrow('Unknown selected object')
    expect(h1.store.getSnapshot().scene).toBe(beforeReset)
    await expect(
      h1.call('fn_composeScene', {
        updates: [{ id: 'keep-me', name: '   ' }],
      }),
    ).rejects.toThrow('non-empty string')

    // Explicit shot works headlessly in fn_composeScene
    const headlessCompose = createHarness({ withViewport: false })
    const composedHeadless = await headlessCompose.call('fn_composeScene', {
      add: [{ id: 'cube', kind: 'box' }],
      shot: { position: [3, 2, 4], target: [0, 0, 0], fov: 40 },
    })
    expect(composedHeadless.json.data.camera).toEqual({
      position: [3, 2, 4],
      target: [0, 0, 0],
      fov: 40,
    })

    // 3. fn_setupLightingAndLook guards kind mismatch, allows overriding studio rig light, and avoids no-op save
    const hLight = createHarness({ withViewport: false })
    hLight.store.edit([{ op: 'add', object: { ...makeObject('box', 'Collision'), id: 'studio-backdrop' } }])
    await expect(
      hLight.call('fn_setupLightingAndLook', { addStudioRig: true }),
    ).rejects.toThrow('already uses that ID')
    const noOpShot = await hLight.call('fn_setupLightingAndLook', {
      shot: { azimuth: 30 },
    })
    expect(noOpShot.json.data.cameraNote).toContain('unavailable')
    expect(hLight.document.save).not.toHaveBeenCalled()

    // Overriding studio-key-light in the same call updates instead of colliding
    const hRig = createHarness()
    const rigRes = await hRig.call('fn_setupLightingAndLook', {
      addStudioRig: true,
      lights: [
        {
          id: 'studio-key-light',
          name: 'Warm Key',
          type: 'area',
          position: [4, 4, 4],
          intensity: 4.5,
        },
      ],
    })
    expect(rigRes.json.data.lightIds).toEqual([
      'studio-key-light',
      'studio-fill-light',
      'studio-rim-light',
    ])

    // 4. fn_styleMaterialsAndTextures validates texturePatch & generateTexture before mutating or spending API calls
    const hStyle = createHarness()
    hStyle.store.edit([
      { op: 'add', object: { ...makeObject('box', 'A'), id: 'a' } },
      { op: 'add', object: { ...makeObject('box', 'B'), id: 'b' } },
    ])
    const genSpy = vi.spyOn(vision, 'generate')
    const beforeStyle = hStyle.store.getSnapshot().scene
    await expect(
      hStyle.call('fn_styleMaterialsAndTextures', {
        assignments: [
          { objectIds: ['a'], material: { preset: 'gold' } },
          { objectIds: ['b'], texturePatch: { repeat: [2, 2] } },
        ],
      }),
    ).rejects.toThrow('no resolved texture')
    expect(hStyle.store.getSnapshot().scene).toBe(beforeStyle)

    await expect(
      hStyle.call('fn_styleMaterialsAndTextures', {
        assignments: [{ objectIds: ['a'], material: { preset: 'gold' } }],
        generateTexture: {
          objectId: 'a',
          prompt: 'Brick wall',
          applyToObjectIds: ['missing-target'],
        },
      }),
    ).rejects.toThrow('Unknown object ID')
    expect(genSpy).not.toHaveBeenCalled()
    expect(hStyle.store.getSnapshot().scene).toBe(beforeStyle)

    await expect(
      hStyle.call('fn_styleMaterialsAndTextures', {
        generateTexture: {
          objectId: 'a',
          prompt: 'Brick wall',
          size: '512x512',
        },
      }),
    ).rejects.toThrow('generateTexture.size')
    expect(genSpy).not.toHaveBeenCalled()

    // 5. fn_directCameraAndShots validates time/aspect/size up front and uses explicit duration for orbit endTime
    const hCam = createHarness()
    hCam.store.edit([{ op: 'add', object: { ...makeObject('box', 'Obj'), id: 'obj' } }])
    const beforeCam = hCam.store.getSnapshot().scene
    await expect(
      hCam.call('fn_directCameraAndShots', {
        duration: 10,
        time: -2,
      }),
    ).rejects.toThrow('time must be >= 0')
    expect(hCam.store.getSnapshot().scene).toBe(beforeCam)
    await expect(
      hCam.call('fn_directCameraAndShots', {
        capturePreview: true,
        aspect: '2:1',
      }),
    ).rejects.toThrow('aspect must be one of')
    const orbitRes = await hCam.call('fn_directCameraAndShots', {
      duration: 10,
      orbit: { steps: 3 },
    })
    expect(
      orbitRes.json.data.authoredCameraKeys.map((k: { time: number }) => k.time),
    ).toEqual([0, 5, 10])
  })
})
