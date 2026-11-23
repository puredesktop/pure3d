import {
  defineAppFunction,
  type AppFunctionDefinition,
} from '@purescience/platform-ui/bridge/appFunctions'
import {
  GENERATORS,
  GENERATOR_KINDS,
  generatorParams,
} from '../lib/generatorSpecs.mjs'
import { KIT } from '../lib/kit.mjs'
import { resolveLook } from '../lib/look'
import { MATERIAL_PRESETS } from '../lib/materialPresets.mjs'
import {
  descendants,
  emptyScene,
  identityTransform,
  isGenerated,
  resolveMaterial,
} from '../lib/scene'
import {
  ASPECTS,
  lookSchema,
  materialSchema,
  shapeSchema,
  shotSchema,
  vectorSchema,
} from '../lib/schemas.mjs'
import { SURFACES } from '../lib/surfaceSpecs.mjs'
import {
  cameraReply,
  cappedIds,
  changesReply,
  diffScenes,
  sceneHeader,
  workspaceState,
} from '../lib/toolReplies'
import {
  applyTextureReference,
  generateObjectTexture,
  patchTextureReferences,
} from '../lib/workflows'
import type { Operation, SceneObject, ShotSpec, Vec3 } from '../types'
import {
  commitAndSummarize,
  readLiveState,
  SceneToolError,
  type Pure3DAgentContext,
} from './context'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined
}

function asVec3(value: unknown, field: string): Vec3 {
  const parsed = vectorSchema.safeParse(value)
  if (!parsed.success) {
    throw new SceneToolError(
      `${field} must be a 3-number [x, y, z] finite array.`,
    )
  }
  return parsed.data
}

function asPositiveVec3(value: unknown, field: string): Vec3 {
  const v = asVec3(value, field)
  if (!v.every(n => n > 0)) {
    throw new SceneToolError(`${field} components must all be positive.`)
  }
  return v
}

function asHex(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) {
    throw new SceneToolError(`${field} must be a #rrggbb hex color.`)
  }
  return value
}

function asFiniteNumber(
  value: unknown,
  field: string,
  min?: number,
  max?: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new SceneToolError(`${field} must be a finite number.`)
  }
  if (min !== undefined && value < min) {
    throw new SceneToolError(`${field} must be >= ${min}.`)
  }
  if (max !== undefined && value > max) {
    throw new SceneToolError(`${field} must be <= ${max}.`)
  }
  return value
}

const PRIMITIVE_KINDS = [
  'box',
  'sphere',
  'cylinder',
  'cone',
  'torus',
  'plane',
  'group',
] as const

const CREATABLE_KINDS = [...PRIMITIVE_KINDS, ...GENERATOR_KINDS] as const

const LOOK_PRESETS = [
  'golden-hour',
  'studio-product',
  'moonlit-night',
  'overcast-day',
  'dramatic-dusk',
  'clean-daylight',
] as const

type LookPresetName = (typeof LOOK_PRESETS)[number]

const LOOK_PRESET_CONFIGS: Record<
  LookPresetName,
  {
    look: Record<string, unknown>
    background?: string
    grid?: boolean
  }
> = {
  'golden-hour': {
    look: {
      environment: 'sky',
      sunElevation: 10,
      sunAzimuth: 55,
      sunIntensity: 3.4,
      sunColor: '#ffbe7a',
      environmentIntensity: 1.0,
      haze: 0.35,
      clouds: 0.3,
      shadows: 'soft',
      fog: 0.12,
      exposure: 1.05,
      ambientOcclusion: 1.0,
      bloom: 0.25,
      lightShafts: 0.25,
      saturation: 1.08,
      contrast: 1.05,
      warmth: 0.22,
      vignette: 0.15,
    },
    grid: false,
  },
  'studio-product': {
    look: {
      environment: 'studio',
      sunElevation: 48,
      sunAzimuth: 40,
      sunIntensity: 1.6,
      environmentIntensity: 1.15,
      shadows: 'soft',
      fog: 0,
      exposure: 1.05,
      ambientOcclusion: 1.1,
      bloom: 0.08,
      saturation: 1.02,
      contrast: 1.06,
      warmth: 0.02,
      vignette: 0.12,
    },
    background: '#e9e7e3',
    grid: false,
  },
  'moonlit-night': {
    look: {
      environment: 'night',
      stars: 0.75,
      sunElevation: 26,
      sunAzimuth: 145,
      sunIntensity: 1.1,
      environmentIntensity: 0.85,
      haze: 0.25,
      shadows: 'soft',
      fog: 0.18,
      exposure: 1.55,
      ambientOcclusion: 1.0,
      bloom: 0.45,
      saturation: 0.96,
      contrast: 1.08,
      warmth: -0.15,
      vignette: 0.22,
    },
    grid: false,
  },
  'overcast-day': {
    look: {
      environment: 'sky',
      sunElevation: 42,
      sunAzimuth: 60,
      sunIntensity: 1.6,
      environmentIntensity: 1.25,
      haze: 0.45,
      clouds: 0.85,
      shadows: 'soft',
      fog: 0.16,
      exposure: 1.0,
      ambientOcclusion: 1.15,
      bloom: 0.05,
      saturation: 0.92,
      contrast: 0.98,
      warmth: -0.05,
      vignette: 0.08,
    },
    grid: false,
  },
  'dramatic-dusk': {
    look: {
      environment: 'sky',
      sunElevation: -2,
      sunAzimuth: 245,
      sunIntensity: 1.4,
      sunColor: '#ff7a4a',
      environmentIntensity: 0.9,
      haze: 0.5,
      clouds: 0.5,
      shadows: 'soft',
      fog: 0.2,
      exposure: 1.25,
      ambientOcclusion: 1.0,
      bloom: 0.4,
      saturation: 1.12,
      contrast: 1.1,
      warmth: 0.12,
      vignette: 0.25,
    },
    grid: false,
  },
  'clean-daylight': {
    look: {
      environment: 'sky',
      sunElevation: 38,
      sunAzimuth: 50,
      sunIntensity: 3.0,
      environmentIntensity: 1.05,
      haze: 0.15,
      clouds: 0.25,
      shadows: 'soft',
      fog: 0.04,
      exposure: 1.0,
      ambientOcclusion: 1.0,
      bloom: 0.1,
      saturation: 1.02,
      contrast: 1.02,
      warmth: 0.04,
      vignette: 0.06,
    },
    grid: false,
  },
}

const SHOT_SCHEMA_JSON: Record<string, unknown> = {
  type: 'object',
  description:
    'Camera framing: explicit { position: [x,y,z], target: [x,y,z], fov? } or subject-framed { objectIds?, azimuth?, elevation?, fill?, distance?, fov? }.',
}

function buildCatalog(section: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (section === 'all' || section === 'generators') {
    out.generators = Object.fromEntries(
      Object.entries(GENERATORS).map(([kind, spec]) => [
        kind,
        {
          label: spec.label,
          description: spec.description,
          params: Object.fromEntries(
            spec.params.map(p => [
              p.key,
              {
                type: p.type,
                default: p.default,
                ...(p.type === 'number' ? { min: p.min, max: p.max } : {}),
                ...(p.type === 'select' ? { options: p.options } : {}),
                ...(p.hint ? { hint: p.hint } : {}),
              },
            ]),
          ),
        },
      ]),
    )
  }
  if (section === 'all' || section === 'kit') {
    out.kitModels = KIT.map(item => ({
      name: item.name,
      label: item.label,
      category: item.category,
      sizeMeters: item.size,
    }))
  }
  if (section === 'all' || section === 'materials') {
    out.materialPresets = Object.fromEntries(
      Object.entries(MATERIAL_PRESETS).map(([name, spec]) => [
        name,
        {
          label: spec.label,
          color: spec.color,
          metalness: spec.metalness,
          roughness: spec.roughness,
          ...(spec.clearcoat ? { clearcoat: spec.clearcoat } : {}),
          ...(spec.transmission ? { transmission: spec.transmission } : {}),
          ...(spec.sheen ? { sheen: spec.sheen } : {}),
          ...(spec.surface && spec.surface !== 'none'
            ? { surface: spec.surface }
            : {}),
        },
      ]),
    )
  }
  if (section === 'all' || section === 'surfaces') {
    out.surfaces = Object.fromEntries(
      Object.entries(SURFACES).map(([kind, spec]) => [
        kind,
        {
          label: spec.label,
          description: spec.description,
          defaultScaleMeters: spec.scale,
        },
      ]),
    )
  }
  return out
}

function resolveTargetObjects(
  objects: readonly SceneObject[],
  spec: {
    objectIds?: string[]
    kinds?: string[]
    nameContains?: string
    recursive?: boolean
  },
  scene: Parameters<typeof descendants>[0],
): SceneObject[] {
  const knownById = new Map(objects.map(o => [o.id, o]))
  const selectedIds = new Set<string>()

  if (spec.objectIds && spec.objectIds.length > 0) {
    for (const id of spec.objectIds) {
      if (!knownById.has(id)) {
        throw new SceneToolError(`Unknown object ID "${id}".`)
      }
      selectedIds.add(id)
    }
  } else {
    const kindSet = spec.kinds?.length ? new Set(spec.kinds) : null
    const needle = spec.nameContains?.toLowerCase() ?? null
    if (!kindSet && !needle) {
      throw new SceneToolError(
        'Each assignment must specify objectIds, kinds, or nameContains.',
      )
    }
    for (const obj of objects) {
      if (kindSet && !kindSet.has(obj.kind)) continue
      if (needle && !obj.name.toLowerCase().includes(needle)) continue
      selectedIds.add(obj.id)
    }
  }

  if (spec.recursive) {
    for (const id of [...selectedIds]) {
      for (const childId of descendants(scene, id)) {
        selectedIds.add(childId)
      }
    }
  }

  return objects.filter(o => selectedIds.has(o.id))
}

function buildObjectFromDraft(raw: Record<string, unknown>): SceneObject {
  const kindRaw = raw.kind
  const parsedKind = shapeSchema.safeParse(kindRaw)
  if (!parsedKind.success || parsedKind.data === 'mesh') {
    throw new SceneToolError(
      `Unsupported object kind "${String(kindRaw)}". Use one of ${CREATABLE_KINDS.join(', ')} (or call extended editScene for raw triangle meshes).`,
    )
  }
  const kind = parsedKind.data
  const id = asString(raw.id) ?? crypto.randomUUID()
  const name = asString(raw.name) ?? kind
  const parentId =
    raw.parentId === null || raw.parentId === undefined
      ? null
      : (asString(raw.parentId) ?? null)
  const visible = typeof raw.visible === 'boolean' ? raw.visible : true

  const base = identityTransform()
  const transformRaw = isPlainObject(raw.transform) ? raw.transform : {}
  const position =
    raw.position !== undefined
      ? asVec3(raw.position, `add[${id}].position`)
      : transformRaw.position !== undefined
        ? asVec3(transformRaw.position, `add[${id}].transform.position`)
        : base.position
  const rotation =
    raw.rotation !== undefined
      ? asVec3(raw.rotation, `add[${id}].rotation`)
      : transformRaw.rotation !== undefined
        ? asVec3(transformRaw.rotation, `add[${id}].transform.rotation`)
        : base.rotation
  const scale =
    raw.scale !== undefined
      ? asPositiveVec3(raw.scale, `add[${id}].scale`)
      : transformRaw.scale !== undefined
        ? asPositiveVec3(transformRaw.scale, `add[${id}].transform.scale`)
        : base.scale

  const material =
    raw.material !== undefined
      ? materialSchema.parse(raw.material)
      : {}

  const generated = isGenerated(kind)
  if (!generated && raw.params !== undefined) {
    throw new SceneToolError(
      `Object "${id}" of kind "${kind}" does not accept params; only generated kinds (${GENERATOR_KINDS.join(', ')}) do.`,
    )
  }
  const params = generated
    ? generatorParams(
        kind,
        isPlainObject(raw.params) ? raw.params : undefined,
      )
    : undefined

  return {
    id,
    name,
    kind,
    parentId,
    visible,
    transform: { position, rotation, scale },
    material,
    geometry: null,
    ...(params !== undefined ? { params } : {}),
  }
}

/**
 * 1. `fn_inspectSceneHealth` — Read-only scene audit, structural diagnostics & on-demand catalog.
 */
export const fnInspectSceneHealth = defineAppFunction<Pure3DAgentContext>({
  name: 'fn_inspectSceneHealth',
  category: 'read',
  risk: 'read',
  requiresApproval: false,
  replaces: ['getScene'],
  description:
    'Inspect the active 3D scene in one read-only call: returns header, counts by kind, lighting/look summary, hierarchy stats, texture asset usage, actionable visual/structural warnings (grid left on, unlit night scenes, plain toy-like surfaces, broken scatter terrain refs, orphaned textures, out-of-range keys), plus optional on-demand generator/kit/material/surface catalogs so you never guess parameter names.',
  inputSchema: {
    type: 'object',
    properties: {
      includeCatalog: {
        type: 'string',
        enum: ['none', 'generators', 'kit', 'materials', 'surfaces', 'all'],
        description:
          'Optional catalog reference to return: generator param schemas, CC0 kit model names/sizes, material presets, procedural surfaces, or all.',
      },
      focusIds: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional object IDs to inspect in detail with transforms, params, and resolved inherited materials.',
      },
      nameContains: {
        type: 'string',
        description:
          'Optional case-insensitive substring to filter detailed object inspection.',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 200,
        description:
          'Maximum number of outline or focused object rows to return (default 40).',
      },
    },
    additionalProperties: false,
  },
  run: async (ctx, args) => {
    const state = readLiveState(ctx)
    const { scene } = state
    const limit =
      typeof args.limit === 'number' &&
      Number.isInteger(args.limit) &&
      args.limit >= 1 &&
      args.limit <= 200
        ? args.limit
        : 40

    const byKind: Record<string, number> = {}
    const idSet = new Set(scene.objects.map(o => o.id))
    let hiddenCount = 0
    let rootCount = 0
    const lights: Array<Record<string, unknown>> = []
    const emissiveIds: string[] = []
    const plainMaterialIds: string[] = []
    const brokenScatterIds: string[] = []
    const referencedAssets = new Set<string>()
    const terrainIds = new Set(
      scene.objects.filter(o => o.kind === 'terrain').map(o => o.id),
    )

    for (const obj of scene.objects) {
      byKind[obj.kind] = (byKind[obj.kind] ?? 0) + 1
      if (!obj.visible) hiddenCount += 1
      if (!obj.parentId) rootCount += 1

      const resolved = resolveMaterial(scene, obj)
      if (resolved.texture?.assetId) referencedAssets.add(resolved.texture.assetId)
      if (obj.material.texture?.assetId) {
        referencedAssets.add(obj.material.texture.assetId)
      }
      if (resolved.emissive && (resolved.emissiveIntensity ?? 1) > 0) {
        emissiveIds.push(obj.id)
      }

      if (obj.kind === 'light') {
        lights.push({
          id: obj.id,
          name: obj.name,
          visible: obj.visible,
          position: obj.transform.position,
          ...(obj.params ?? {}),
        })
      } else if (
        obj.kind === 'lantern' &&
        typeof obj.params?.light === 'number' &&
        obj.params.light > 0
      ) {
        lights.push({
          id: obj.id,
          name: obj.name,
          kind: 'lantern',
          visible: obj.visible,
          position: obj.transform.position,
          light: obj.params.light,
          glow: obj.params.glow,
        })
      }

      if (
        !isGenerated(obj.kind) &&
        obj.kind !== 'group' &&
        !resolved.texture &&
        (!resolved.surface || resolved.surface === 'none') &&
        (!obj.material.preset || obj.material.preset === 'none')
      ) {
        plainMaterialIds.push(obj.id)
      }

      if (obj.kind === 'scatter') {
        const onId = typeof obj.params?.on === 'string' ? obj.params.on : ''
        if (onId && !terrainIds.has(onId)) {
          brokenScatterIds.push(obj.id)
        }
      }
    }

    const orphanedTextureAssets = scene.textureAssets
      .map(a => a.id)
      .filter(id => !referencedAssets.has(id))

    const outOfRangeKeyframes = scene.keyframes.filter(
      k => k.time > scene.settings.duration,
    ).length
    const outOfRangeCameraKeys = (scene.cameraKeys ?? []).filter(
      k => k.time > scene.settings.duration,
    ).length

    const look = resolveLook(scene)
    const warnings: Array<{ code: string; message: string; ids?: string[] }> = []

    if (scene.objects.length === 0) {
      warnings.push({
        code: 'empty-scene',
        message: 'Scene has no objects yet; use fn_composeScene to add geometry or generated shapes.',
      })
    }
    if (scene.settings.grid && scene.objects.length > 0) {
      warnings.push({
        code: 'grid-enabled',
        message: 'Viewport grid is enabled; turn settings.grid off before final renders.',
      })
    }
    if (
      look.environment === 'night' &&
      lights.length === 0 &&
      emissiveIds.length === 0
    ) {
      warnings.push({
        code: 'unlit-night-scene',
        message:
          'Environment is "night" with no lights or emissive objects; add light/lantern objects or windowGlow and consider exposure 1.3-2.0.',
      })
    }
    if (plainMaterialIds.length > 0) {
      warnings.push({
        code: 'plain-materials',
        message: `${plainMaterialIds.length} primitive/mesh object(s) have plain smooth colors without a material preset, surface, or texture.`,
        ids: plainMaterialIds.slice(0, 15),
      })
    }
    if (brokenScatterIds.length > 0) {
      warnings.push({
        code: 'broken-scatter-terrain',
        message: `${brokenScatterIds.length} scatter object(s) reference a missing terrain ID in params.on.`,
        ids: brokenScatterIds,
      })
    }
    if (orphanedTextureAssets.length > 0) {
      warnings.push({
        code: 'orphaned-textures',
        message: `${orphanedTextureAssets.length} retained texture asset(s) are not bound to any object.`,
        ids: orphanedTextureAssets.slice(0, 15),
      })
    }
    if (outOfRangeKeyframes > 0 || outOfRangeCameraKeys > 0) {
      warnings.push({
        code: 'keys-past-duration',
        message: `${outOfRangeKeyframes} object keyframe(s) and ${outOfRangeCameraKeys} camera key(s) exceed settings.duration (${scene.settings.duration}s).`,
      })
    }

    const focusIds = Array.isArray(args.focusIds)
      ? args.focusIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : []
    const nameContains = asString(args.nameContains)?.toLowerCase()
    const missingFocusIds = focusIds.filter(id => !idSet.has(id))

    let focusedObjects: Array<Record<string, unknown>> | undefined
    if (focusIds.length > 0 || nameContains) {
      const focusSet = focusIds.length > 0 ? new Set(focusIds) : null
      focusedObjects = scene.objects
        .filter(obj => {
          if (focusSet && !focusSet.has(obj.id)) return false
          if (nameContains && !obj.name.toLowerCase().includes(nameContains)) {
            return false
          }
          return true
        })
        .slice(0, limit)
        .map(obj => ({
          id: obj.id,
          name: obj.name,
          kind: obj.kind,
          parentId: obj.parentId,
          visible: obj.visible,
          transform: obj.transform,
          ...(obj.params ? { params: obj.params } : {}),
          material: resolveMaterial(scene, obj),
        }))
    }

    const catalogMode = asString(args.includeCatalog) ?? 'none'
    const catalog =
      catalogMode !== 'none' ? buildCatalog(catalogMode) : undefined

    const outline = scene.objects.slice(0, limit).map(o => ({
      id: o.id,
      name: o.name,
      kind: o.kind,
      ...(o.parentId ? { parentId: o.parentId } : {}),
      ...(o.visible ? {} : { visible: false }),
    }))

    return {
      mutated: false,
      summary: `Inspected "${scene.title}" (${scene.objects.length} objects, ${lights.length} lights, ${warnings.length} warnings).`,
      data: {
        scene: sceneHeader(scene),
        path: ctx.document.doc.path,
        rendererReady: !!ctx.viewport.current,
        units: 'meters',
        rotationUnits: 'XYZ Euler radians',
        timeUnits: 'seconds',
        workspace: workspaceState(state),
        camera: cameraReply(ctx.store.getCameraSnapshot()),
        counts: {
          totalObjects: scene.objects.length,
          roots: rootCount,
          hidden: hiddenCount,
          byKind,
          animatedObjects: new Set(scene.keyframes.map(k => k.objectId)).size,
          keyframes: scene.keyframes.length,
          cameraKeys: scene.cameraKeys?.length ?? 0,
          textureAssets: scene.textureAssets.length,
        },
        lighting: {
          grid: scene.settings.grid,
          background: scene.settings.background,
          look,
          lights,
          emissiveObjectIds: emissiveIds.slice(0, 15),
        },
        textureAssetIds: scene.textureAssets.map(a => a.id),
        warnings,
        outline,
        ...(scene.objects.length > limit
          ? { outlineMore: scene.objects.length - limit }
          : {}),
        ...(focusedObjects
          ? {
              focusedObjects,
              ...(missingFocusIds.length ? { missingFocusIds } : {}),
            }
          : {}),
        ...(catalog ? { catalog } : {}),
      },
    }
  },
})

/**
 * 2. `fn_composeScene` — Ergonomic atomic multi-object scene creation/editing + optional camera framing + save.
 */
export const fnComposeScene = defineAppFunction<Pure3DAgentContext>({
  name: 'fn_composeScene',
  category: 'modeling',
  risk: 'write',
  requiresApproval: false,
  replaces: ['newScene', 'editScene', 'setWorkspace'],
  description:
    'Compose or update a 3D scene atomically in one call: optionally start a clean empty scene with a title, add primitives, procedural generators (terrain, scatter, building, tree, rock, water, boat, dock, fence, lantern, light, backdrop, crate, barrel, bench, roundedBox) or bundled CC0 kit models (kind "model") using ergonomic shorthand transforms/materials, update or delete existing objects, patch scene settings/look, optionally frame a hero camera shot, and autosave.',
  inputSchema: {
    type: 'object',
    properties: {
      resetScene: {
        type: 'boolean',
        description:
          'When true, starts from a clean empty scene before applying additions and settings.',
      },
      title: {
        type: 'string',
        description: 'Optional scene title.',
      },
      add: {
        type: 'array',
        description:
          'Objects to add: { kind, id?, name?, parentId?, visible?, position?, rotation?, scale?, material?, params? }. Kinds: box, sphere, cylinder, cone, torus, plane, group, terrain, scatter, tree, rock, water, roundedBox, building, boat, dock, fence, lantern, crate, barrel, bench, model, light, backdrop.',
        items: {
          type: 'object',
          required: ['kind'],
        },
      },
      updates: {
        type: 'array',
        description:
          'Objects to update: { id, name?, parentId?, visible?, position?, rotation?, scale?, material?, params?, clearMaterialOverride? }.',
        items: {
          type: 'object',
          required: ['id'],
        },
      },
      removeIds: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Object IDs to delete (each removes its subtree and animation keys).',
      },
      settings: {
        type: 'object',
        description:
          'Optional scene settings patch: { duration?, fps?, background?, grid?, look? }.',
      },
      selectId: {
        type: ['string', 'null'],
        description: 'Optional object ID to select after editing.',
      },
      shot: SHOT_SCHEMA_JSON,
    },
    additionalProperties: false,
  },
  run: async (ctx, args) => {
    const resetScene = args.resetScene === true
    const title = asString(args.title)
    const addItems = Array.isArray(args.add) ? args.add : []
    const updateItems = Array.isArray(args.updates) ? args.updates : []
    const removeIds = Array.isArray(args.removeIds)
      ? args.removeIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : []
    const settingsRaw = isPlainObject(args.settings) ? args.settings : undefined
    const shotRaw = args.shot !== undefined ? shotSchema.parse(args.shot) : undefined

    if (
      !resetScene &&
      !title &&
      addItems.length === 0 &&
      updateItems.length === 0 &&
      removeIds.length === 0 &&
      !settingsRaw &&
      args.selectId === undefined &&
      !shotRaw
    ) {
      throw new SceneToolError(
        'Provide at least one scene change (resetScene, title, add, updates, removeIds, settings, selectId, or shot).',
      )
    }

    const operations: Operation[] = []
    const addedIds: string[] = []

    for (const rawItem of addItems) {
      if (!isPlainObject(rawItem)) {
        throw new SceneToolError('Each entry in add must be an object.')
      }
      const object = buildObjectFromDraft(rawItem)
      addedIds.push(object.id)
      operations.push({ op: 'add', object })
    }

    for (const rawUpdate of updateItems) {
      if (!isPlainObject(rawUpdate)) {
        throw new SceneToolError('Each entry in updates must be an object.')
      }
      const id = asString(rawUpdate.id)
      if (!id) throw new SceneToolError('Each update requires an object id.')
      if (rawUpdate.clearMaterialOverride === true) {
        operations.push({ op: 'clearMaterialOverride', id })
      }
      const patch: Record<string, unknown> = {}
      if (rawUpdate.name !== undefined) patch.name = asString(rawUpdate.name)
      if (rawUpdate.parentId !== undefined) patch.parentId = rawUpdate.parentId
      if (typeof rawUpdate.visible === 'boolean') patch.visible = rawUpdate.visible

      const transformPatch: Record<string, unknown> = {}
      if (rawUpdate.position !== undefined) {
        transformPatch.position = asVec3(rawUpdate.position, `updates[${id}].position`)
      }
      if (rawUpdate.rotation !== undefined) {
        transformPatch.rotation = asVec3(rawUpdate.rotation, `updates[${id}].rotation`)
      }
      if (rawUpdate.scale !== undefined) {
        transformPatch.scale = asPositiveVec3(rawUpdate.scale, `updates[${id}].scale`)
      }
      if (Object.keys(transformPatch).length > 0) {
        patch.transform = transformPatch
      }
      if (rawUpdate.material !== undefined) {
        patch.material = materialSchema.parse(rawUpdate.material)
      }
      if (isPlainObject(rawUpdate.params)) {
        patch.params = rawUpdate.params
      }
      if (Object.keys(patch).length > 0) {
        operations.push({ op: 'update', id, patch } as Operation)
      }
    }

    for (const id of removeIds) {
      operations.push({ op: 'delete', id })
    }

    if (title || settingsRaw) {
      const settingsPatch: Record<string, unknown> = {}
      if (settingsRaw) {
        if (settingsRaw.duration !== undefined) {
          settingsPatch.duration = asFiniteNumber(settingsRaw.duration, 'settings.duration', 0.1, 3600)
        }
        if (settingsRaw.fps !== undefined) {
          const fps = asFiniteNumber(settingsRaw.fps, 'settings.fps', 1, 120)
          if (!Number.isInteger(fps)) {
            throw new SceneToolError('settings.fps must be an integer.')
          }
          settingsPatch.fps = fps
        }
        if (settingsRaw.background !== undefined) {
          settingsPatch.background = asHex(settingsRaw.background, 'settings.background')
        }
        if (typeof settingsRaw.grid === 'boolean') {
          settingsPatch.grid = settingsRaw.grid
        }
        if (settingsRaw.look !== undefined) {
          settingsPatch.look = lookSchema.parse(settingsRaw.look)
        }
      }
      operations.push({
        op: 'settings',
        ...(title ? { title } : {}),
        ...(Object.keys(settingsPatch).length > 0 ? { settings: settingsPatch } : {}),
      } as Operation)
    }

    const before = ctx.store.getSnapshot().scene
    if (resetScene) {
      ctx.store.replace(emptyScene(title ?? 'Untitled scene'))
    }
    if (operations.length > 0) {
      ctx.store.edit(operations)
    }
    if (args.selectId !== undefined) {
      ctx.store.workspace({
        selectedId:
          args.selectId === null ? null : (asString(args.selectId) ?? null),
      })
    }

    let cameraResult: Record<string, unknown> | undefined
    let cameraSkippedReason: string | undefined
    if (shotRaw) {
      if (ctx.viewport.current) {
        const { blockedBy, ...camera } = ctx.viewport.current.shot(
          shotRaw,
          ctx.viewport.current.aspect(),
        )
        ctx.store.setCamera(camera)
        ctx.store.persistCamera()
        cameraResult = {
          ...cameraReply(camera),
          ...(blockedBy ? { blockedBy } : {}),
        }
      } else {
        cameraSkippedReason = 'Viewport renderer unavailable; camera shot skipped.'
      }
    }

    const committed = await commitAndSummarize(ctx, before, {
      ...(resetScene ? { resetScene: true } : {}),
      operationsApplied: operations.length,
      ...cappedIds('addedIds', addedIds),
      ...(cameraResult ? { camera: cameraResult } : {}),
      ...(cameraSkippedReason ? { cameraNote: cameraSkippedReason } : {}),
    })

    const parts: string[] = []
    if (resetScene) parts.push('reset scene')
    if (addedIds.length) parts.push(`added ${addedIds.length}`)
    if (updateItems.length) parts.push(`updated ${updateItems.length}`)
    if (removeIds.length) parts.push(`removed ${removeIds.length}`)
    if (settingsRaw || title) parts.push('updated settings')
    if (cameraResult) parts.push('framed camera')

    return {
      mutated: true,
      summary: `Composed "${committed.scene.title}": ${parts.join(', ') || 'saved scene'}.`,
      data: committed,
    }
  },
})

/**
 * 3. `fn_setupLightingAndLook` — Complete lighting rig, atmosphere preset, studio backdrop & finishing grade in 1 call.
 */
export const fnSetupLightingAndLook = defineAppFunction<Pure3DAgentContext>({
  name: 'fn_setupLightingAndLook',
  category: 'lighting',
  risk: 'write',
  requiresApproval: false,
  replaces: ['editScene', 'setWorkspace'],
  description:
    'Configure scene lighting, atmosphere, studio backdrop, practical lights, and post-processing grade in one atomic save. Choose a curated preset (golden-hour, studio-product, moonlit-night, overcast-day, dramatic-dusk, clean-daylight) and/or supply custom settings.look overrides, optional studio cyclorama + 3-point area-light rig aimed at a subject, explicit point/spot/area lights, grid toggle, and optional hero camera framing.',
  inputSchema: {
    type: 'object',
    properties: {
      preset: {
        type: 'string',
        enum: [...LOOK_PRESETS],
        description:
          'Curated atmosphere & lighting preset. Custom look fields override preset values.',
      },
      look: {
        type: 'object',
        description:
          'Optional settings.look fields merged over any preset (environment, sunElevation, sunAzimuth, sunIntensity, sunColor, haze, clouds, shadows, fog, exposure, ambientOcclusion, bloom, focusDistance, aperture, lightShafts, saturation, contrast, warmth, vignette, stars).',
      },
      background: {
        type: 'string',
        description: 'Optional #rrggbb background color.',
      },
      grid: {
        type: 'boolean',
        description:
          'Show or hide the viewport grid (presets default grid to false for clean renders).',
      },
      addStudioRig: {
        type: 'boolean',
        description:
          'When true, adds or updates a seamless studio cyclorama backdrop plus 3-point key/fill/rim area lights aimed at studioTarget.',
      },
      studioTarget: {
        type: 'array',
        items: { type: 'number' },
        minItems: 3,
        maxItems: 3,
        description: 'World [x, y, z] center that the 3-point studio rig aims at (default [0, 0.7, 0]).',
      },
      studioBackdropColor: {
        type: 'string',
        description: 'Optional #rrggbb color for the studio cyclorama backdrop (default #e9e7e3).',
      },
      lights: {
        type: 'array',
        description:
          'Explicit lights to add or update by id: { type: "point"|"spot"|"area", position: [x,y,z], id?, name?, target?: [x,y,z], color?, intensity?, range?, angle?, softness?, width?, height?, shadows?: "yes"|"no" }.',
        items: {
          type: 'object',
          required: ['type', 'position'],
        },
      },
      shot: SHOT_SCHEMA_JSON,
    },
    additionalProperties: false,
  },
  run: async (ctx, args) => {
    const presetName = asString(args.preset) as LookPresetName | undefined
    if (presetName && !LOOK_PRESETS.includes(presetName)) {
      throw new SceneToolError(
        `Unknown lighting preset "${presetName}". Use one of ${LOOK_PRESETS.join(', ')}.`,
      )
    }
    const presetCfg = presetName ? LOOK_PRESET_CONFIGS[presetName] : undefined
    const customLook = isPlainObject(args.look)
      ? lookSchema.parse(args.look)
      : undefined
    const mergedLook =
      presetCfg || customLook
        ? lookSchema.parse({
            ...(presetCfg?.look ?? {}),
            ...(customLook ?? {}),
          })
        : undefined

    const background =
      args.background !== undefined
        ? asHex(args.background, 'background')
        : presetCfg?.background
    const grid =
      typeof args.grid === 'boolean' ? args.grid : presetCfg?.grid

    const addStudioRig = args.addStudioRig === true
    const lightsInput = Array.isArray(args.lights) ? args.lights : []
    const shotRaw = args.shot !== undefined ? shotSchema.parse(args.shot) : undefined

    if (
      !mergedLook &&
      background === undefined &&
      grid === undefined &&
      !addStudioRig &&
      lightsInput.length === 0 &&
      !shotRaw
    ) {
      throw new SceneToolError(
        'Provide preset, look, background, grid, addStudioRig, lights, or shot.',
      )
    }

    const before = ctx.store.getSnapshot().scene
    const existingById = new Map(before.objects.map(o => [o.id, o]))
    const operations: Operation[] = []
    const touchedLightIds: string[] = []
    let backdropId: string | undefined

    const upsertObject = (
      id: string,
      name: string,
      kind: 'light' | 'backdrop',
      position: Vec3,
      params: Record<string, number | string>,
    ) => {
      if (existingById.has(id)) {
        operations.push({
          op: 'update',
          id,
          patch: {
            name,
            transform: { position },
            params,
          },
        } as Operation)
      } else {
        operations.push({
          op: 'add',
          object: {
            id,
            name,
            kind,
            parentId: null,
            visible: true,
            transform: {
              position,
              rotation: [0, 0, 0],
              scale: [1, 1, 1],
            },
            material: {},
            geometry: null,
            params: generatorParams(kind, params),
          },
        })
      }
    }

    if (addStudioRig) {
      const target =
        args.studioTarget !== undefined
          ? asVec3(args.studioTarget, 'studioTarget')
          : ([0, 0.7, 0] as Vec3)
      const [tx, ty, tz] = target
      const backdropColor =
        args.studioBackdropColor !== undefined
          ? asHex(args.studioBackdropColor, 'studioBackdropColor')
          : '#e9e7e3'

      backdropId = 'studio-backdrop'
      upsertObject(backdropId, 'Studio Backdrop', 'backdrop', [tx, 0, tz], {
        width: 10,
        depth: 8,
        height: 5,
        radius: 1.8,
        color: backdropColor,
      })

      const rigLights: Array<{
        id: string
        name: string
        position: Vec3
        params: Record<string, number | string>
      }> = [
        {
          id: 'studio-key-light',
          name: 'Studio Key Light',
          position: [tx + 3.2, ty + 2.8, tz + 3.2],
          params: {
            type: 'area',
            color: '#fff6eb',
            intensity: 3.0,
            width: 2.6,
            height: 2.2,
            aim: 'target',
            targetX: tx,
            targetY: ty,
            targetZ: tz,
          },
        },
        {
          id: 'studio-fill-light',
          name: 'Studio Fill Light',
          position: [tx - 3.6, ty + 1.8, tz + 2.2],
          params: {
            type: 'area',
            color: '#e6f0ff',
            intensity: 1.3,
            width: 3.2,
            height: 2.4,
            aim: 'target',
            targetX: tx,
            targetY: ty,
            targetZ: tz,
          },
        },
        {
          id: 'studio-rim-light',
          name: 'Studio Rim Light',
          position: [tx - 1.4, ty + 2.4, tz - 3.0],
          params: {
            type: 'area',
            color: '#ffffff',
            intensity: 2.0,
            width: 2.4,
            height: 1.4,
            aim: 'target',
            targetX: tx,
            targetY: ty,
            targetZ: tz,
          },
        },
      ]
      for (const rig of rigLights) {
        upsertObject(rig.id, rig.name, 'light', rig.position, rig.params)
        touchedLightIds.push(rig.id)
      }
    }

    for (const rawLight of lightsInput) {
      if (!isPlainObject(rawLight)) {
        throw new SceneToolError('Each item in lights must be an object.')
      }
      const lightType = asString(rawLight.type)
      if (lightType !== 'point' && lightType !== 'spot' && lightType !== 'area') {
        throw new SceneToolError(
          `Light type must be "point", "spot", or "area" (got "${String(rawLight.type)}").`,
        )
      }
      const id = asString(rawLight.id) ?? `light-${crypto.randomUUID().slice(0, 8)}`
      const name = asString(rawLight.name) ?? `${lightType} light`
      const position = asVec3(rawLight.position, `lights[${id}].position`)
      const params: Record<string, number | string> = { type: lightType }

      if (rawLight.color !== undefined) {
        params.color = asHex(rawLight.color, `lights[${id}].color`)
      }
      if (rawLight.intensity !== undefined) {
        params.intensity = asFiniteNumber(rawLight.intensity, `lights[${id}].intensity`, 0, 500)
      }
      if (rawLight.range !== undefined) {
        params.range = asFiniteNumber(rawLight.range, `lights[${id}].range`, 0, 1000)
      }
      if (rawLight.angle !== undefined) {
        params.angle = asFiniteNumber(rawLight.angle, `lights[${id}].angle`, 1, 89)
      }
      if (rawLight.softness !== undefined) {
        params.softness = asFiniteNumber(rawLight.softness, `lights[${id}].softness`, 0, 1)
      }
      if (rawLight.width !== undefined) {
        params.width = asFiniteNumber(rawLight.width, `lights[${id}].width`, 0.01, 50)
      }
      if (rawLight.height !== undefined) {
        params.height = asFiniteNumber(rawLight.height, `lights[${id}].height`, 0.01, 50)
      }
      if (rawLight.shadows === 'yes' || rawLight.shadows === 'no') {
        params.shadows = rawLight.shadows
      }
      if (rawLight.target !== undefined) {
        const [tx, ty, tz] = asVec3(rawLight.target, `lights[${id}].target`)
        params.aim = 'target'
        params.targetX = tx
        params.targetY = ty
        params.targetZ = tz
      }

      upsertObject(id, name, 'light', position, params)
      touchedLightIds.push(id)
    }

    const settingsPatch: Record<string, unknown> = {}
    if (mergedLook) settingsPatch.look = mergedLook
    if (background !== undefined) settingsPatch.background = background
    if (grid !== undefined) settingsPatch.grid = grid
    if (Object.keys(settingsPatch).length > 0) {
      operations.push({ op: 'settings', settings: settingsPatch } as Operation)
    }

    if (operations.length > 0) {
      ctx.store.edit(operations)
    }

    let cameraResult: Record<string, unknown> | undefined
    if (shotRaw && ctx.viewport.current) {
      const { blockedBy, ...camera } = ctx.viewport.current.shot(
        shotRaw,
        ctx.viewport.current.aspect(),
      )
      ctx.store.setCamera(camera)
      ctx.store.persistCamera()
      cameraResult = {
        ...cameraReply(camera),
        ...(blockedBy ? { blockedBy } : {}),
      }
    }

    const resolvedLook = resolveLook(ctx.store.getSnapshot().scene)
    const committed = await commitAndSummarize(ctx, before, {
      ...(presetName ? { preset: presetName } : {}),
      look: resolvedLook,
      grid: ctx.store.getSnapshot().scene.settings.grid,
      ...(backdropId ? { backdropId } : {}),
      ...(touchedLightIds.length ? { lightIds: touchedLightIds } : {}),
      ...(cameraResult ? { camera: cameraResult } : {}),
    })

    return {
      mutated: true,
      summary: `Configured lighting & look${presetName ? ` (${presetName})` : ''}${touchedLightIds.length ? ` with ${touchedLightIds.length} light(s)` : ''}.`,
      data: committed,
    }
  },
})

/**
 * 4. `fn_styleMaterialsAndTextures` — Batch PBR material presets, procedural surfaces, retained texture reuse & optional AI texture generation in 1 call.
 */
export const fnStyleMaterialsAndTextures =
  defineAppFunction<Pure3DAgentContext>({
    name: 'fn_styleMaterialsAndTextures',
    category: 'materials',
    risk: 'write',
    requiresApproval: false,
    replaces: ['editScene', 'applyTexture', 'patchTextures', 'generateTexture'],
    description:
      'Apply PBR material presets (gold, glass, marble, varnished-wood, velvet, etc.), procedural surfaces (wood, stone, brick, fabric, etc.), emissive/clearcoat/roughness overrides, retained texture assets, UV tiling patches, and/or one AI-generated texture across explicit object IDs, object kinds, or name matches in a single saved workflow.',
    inputSchema: {
      type: 'object',
      properties: {
        assignments: {
          type: 'array',
          description:
            'Material/surface/texture assignments: { objectIds?, kinds?, nameContains?, recursive?, clearOverride?, material?: { preset?, color?, metalness?, roughness?, opacity?, wireframe?, emissive?, emissiveIntensity?, clearcoat?, transmission?, sheen?, surface?, surfaceScale?, surfaceStrength? }, textureAssetId?, texturePatch?: { color?, repeat?, offset?, rotation?, flipY?, wrapS?, wrapT? } }.',
          items: {
            type: 'object',
          },
        },
        generateTexture: {
          type: 'object',
          description:
            'Optional single AI texture generation request: { objectId, prompt, size?: "auto"|"1024x1024"|"1536x1024"|"1024x1536", editExisting?, applyToObjectIds?, recursive?, texturePatch? }.',
          required: ['objectId', 'prompt'],
        },
      },
      additionalProperties: false,
    },
    run: async (ctx, args) => {
      const assignments = Array.isArray(args.assignments)
        ? args.assignments
        : []
      const genSpec = isPlainObject(args.generateTexture)
        ? args.generateTexture
        : undefined

      if (assignments.length === 0 && !genSpec) {
        throw new SceneToolError(
          'Provide at least one entry in assignments or a generateTexture specification.',
        )
      }

      const before = ctx.store.getSnapshot().scene
      const styledIds = new Set<string>()
      let generatedInfo: Record<string, unknown> | undefined

      // Validate assignments up front before mutating or spending an image generation call.
      const scene = ctx.store.getSnapshot().scene
      const planned: Array<{
        targets: SceneObject[]
        clearOverride: boolean
        material?: Record<string, unknown>
        textureAssetId?: string
        texturePatch?: Record<string, unknown>
        recursive: boolean
      }> = []

      for (const raw of assignments) {
        if (!isPlainObject(raw)) {
          throw new SceneToolError('Each assignment must be an object.')
        }
        const targets = resolveTargetObjects(
          scene.objects,
          {
            objectIds: Array.isArray(raw.objectIds)
              ? raw.objectIds.filter((s): s is string => typeof s === 'string')
              : undefined,
            kinds: Array.isArray(raw.kinds)
              ? raw.kinds.filter((s): s is string => typeof s === 'string')
              : undefined,
            nameContains: asString(raw.nameContains),
            recursive: raw.recursive === true,
          },
          scene,
        )
        if (targets.length === 0) {
          throw new SceneToolError(
            'Assignment matched 0 objects; check objectIds, kinds, or nameContains.',
          )
        }
        const material =
          raw.material !== undefined ? materialSchema.parse(raw.material) : undefined
        const textureAssetId = asString(raw.textureAssetId)
        if (
          textureAssetId &&
          !scene.textureAssets.some(a => a.id === textureAssetId)
        ) {
          throw new SceneToolError(`Unknown texture asset "${textureAssetId}".`)
        }
        const texturePatch = isPlainObject(raw.texturePatch)
          ? raw.texturePatch
          : undefined
        if (
          !raw.clearOverride &&
          !material &&
          !textureAssetId &&
          !texturePatch
        ) {
          throw new SceneToolError(
            'Each assignment must specify material, textureAssetId, texturePatch, or clearOverride.',
          )
        }
        planned.push({
          targets,
          clearOverride: raw.clearOverride === true,
          material,
          textureAssetId,
          texturePatch,
          recursive: raw.recursive === true,
        })
      }

      // 1. Apply deterministic material operations in one atomic batch
      const materialOps: Operation[] = []
      for (const plan of planned) {
        for (const target of plan.targets) {
          if (plan.clearOverride) {
            materialOps.push({ op: 'clearMaterialOverride', id: target.id })
            styledIds.add(target.id)
          }
          if (plan.material) {
            materialOps.push({
              op: 'update',
              id: target.id,
              patch: { material: plan.material },
            } as Operation)
            styledIds.add(target.id)
          }
        }
      }
      if (materialOps.length > 0) {
        ctx.store.edit(materialOps)
      }

      // 2. Apply retained texture bindings & UV patches
      for (const plan of planned) {
        const ids = plan.targets.map(t => t.id)
        if (plan.textureAssetId) {
          const applied = applyTextureReference(ctx.store, {
            assetId: plan.textureAssetId,
            objectIds: ids,
            recursive: false, // targets already expanded when plan.recursive was true
          })
          for (const id of applied) styledIds.add(id)
        }
        if (plan.texturePatch) {
          const patched = patchTextureReferences(ctx.store, {
            objectIds: ids,
            recursive: false,
            patch: plan.texturePatch as Parameters<
              typeof patchTextureReferences
            >[1]['patch'],
          })
          for (const id of patched) styledIds.add(id)
        }
      }

      // 3. Optional single AI texture generation + optional multi-object sharing/patching
      if (genSpec) {
        const objectId = asString(genSpec.objectId)
        const prompt = asString(genSpec.prompt)
        if (!objectId || !prompt) {
          throw new SceneToolError(
            'generateTexture requires non-empty objectId and prompt.',
          )
        }
        const size = asString(genSpec.size) as
          | 'auto'
          | '1024x1024'
          | '1536x1024'
          | '1024x1536'
          | undefined
        const generated = await generateObjectTexture(ctx.store, objectId, {
          prompt,
          size: size ?? '1024x1024',
          editExisting: genSpec.editExisting === true,
        })
        styledIds.add(objectId)

        const extraTargets = Array.isArray(genSpec.applyToObjectIds)
          ? genSpec.applyToObjectIds.filter(
              (id): id is string => typeof id === 'string' && id !== objectId,
            )
          : []
        if (extraTargets.length > 0) {
          const applied = applyTextureReference(ctx.store, {
            assetId: generated.assetId,
            objectIds: extraTargets,
            recursive: genSpec.recursive === true,
          })
          for (const id of applied) styledIds.add(id)
        }
        if (isPlainObject(genSpec.texturePatch)) {
          const patchTargets = [objectId, ...extraTargets]
          const patched = patchTextureReferences(ctx.store, {
            objectIds: patchTargets,
            recursive: genSpec.recursive === true,
            patch: genSpec.texturePatch as Parameters<
              typeof patchTextureReferences
            >[1]['patch'],
          })
          for (const id of patched) styledIds.add(id)
        }
        generatedInfo = generated
      }

      const styledList = [...styledIds]
      const committed = await commitAndSummarize(ctx, before, {
        ...cappedIds('styledObjectIds', styledList),
        ...(generatedInfo ? { generatedTexture: generatedInfo } : {}),
      })

      return {
        mutated: true,
        summary: `Styled ${styledList.length} object(s)${generatedInfo ? ` and generated texture ${String(generatedInfo.assetId)}` : ''}.`,
        data: committed,
      }
    },
  })

/**
 * 5. `fn_directCameraAndShots` — Hero framing, smooth multi-keyframe camera orbit/sequence authoring, occlusion checks & optional preview renders in 1 call.
 */
export const fnDirectCameraAndShots = defineAppFunction<Pure3DAgentContext>({
  name: 'fn_directCameraAndShots',
  category: 'camera',
  risk: 'write',
  requiresApproval: false,
  replaces: ['editScene', 'setWorkspace', 'captureViewport'],
  description:
    'Direct the scene camera and animated camera track in one call: frame and save a heroShot, author a smooth multi-keyframe camera orbit or custom shot sequence (auto-extending scene duration when needed), detect blockedBy occluders on every camera angle, toggle cameraPreview playback, optionally render up to 4 verification viewport PNGs without moving the saved camera, and autosave.',
  inputSchema: {
    type: 'object',
    properties: {
      heroShot: SHOT_SCHEMA_JSON,
      clearExistingKeys: {
        type: 'boolean',
        description:
          'When true, removes all existing scene.cameraKeys before adding new orbit or shot keyframes.',
      },
      duration: {
        type: 'number',
        description:
          'Optional scene duration in seconds (automatically extended if any authored keyframe exceeds current duration).',
      },
      orbit: {
        type: 'object',
        description:
          'Generate an evenly spaced multi-keyframe camera orbit: { objectIds?, startAzimuth?, endAzimuth?, elevation?, distance?, fill?, fov?, startTime?, endTime?, steps? (2-24), easing?: "linear"|"smooth"|"step" }.',
      },
      shots: {
        type: 'array',
        description:
          'Explicit camera keyframes: { time, easing?: "linear"|"smooth"|"step", shot }.',
        items: {
          type: 'object',
          required: ['time', 'shot'],
        },
      },
      cameraPreview: {
        type: 'boolean',
        description: 'Enable or disable animated camera track preview.',
      },
      playing: {
        type: 'boolean',
        description: 'Start or pause timeline playback.',
      },
      time: {
        type: 'number',
        description: 'Move the playhead to this time in seconds.',
      },
      capturePreview: {
        type: 'boolean',
        description:
          'When true and the viewport renderer is available, renders up to 4 preview PNG stills of the hero/keyframed shots without disturbing the saved camera.',
      },
      aspect: {
        type: 'string',
        enum: [...ASPECTS],
        description: 'Aspect ratio for preview renders (default 16:9).',
      },
      size: {
        type: 'integer',
        minimum: 256,
        maximum: 2048,
        description: 'Long-edge pixel dimension for preview renders (256-2048).',
      },
    },
    additionalProperties: false,
  },
  run: async (ctx, args) => {
    const heroShotSpec =
      args.heroShot !== undefined ? shotSchema.parse(args.heroShot) : undefined
    const clearExistingKeys = args.clearExistingKeys === true
    const orbitRaw = isPlainObject(args.orbit) ? args.orbit : undefined
    const shotsRaw = Array.isArray(args.shots) ? args.shots : []
    const capturePreview = args.capturePreview === true

    if (
      !heroShotSpec &&
      !clearExistingKeys &&
      !orbitRaw &&
      shotsRaw.length === 0 &&
      args.duration === undefined &&
      args.cameraPreview === undefined &&
      args.playing === undefined &&
      args.time === undefined &&
      !capturePreview
    ) {
      throw new SceneToolError(
        'Provide heroShot, orbit, shots, clearExistingKeys, duration, cameraPreview, playing, time, or capturePreview.',
      )
    }

    const resolveShot = (
      spec: ShotSpec,
      aspect: number,
    ): { position: Vec3; target: Vec3; fov: number; blockedBy?: string[] } => {
      if (ctx.viewport.current) {
        return ctx.viewport.current.shot(spec, aspect)
      }
      if (spec.position && spec.target) {
        return {
          position: spec.position,
          target: spec.target,
          fov: spec.fov ?? 45,
        }
      }
      throw new SceneToolError(
        'Viewport renderer unavailable for automatic subject framing; supply explicit position and target or wait for the viewport.',
      )
    }

    const before = ctx.store.getSnapshot().scene
    const operations: Operation[] = []
    const authoredKeys: Array<{
      time: number
      position: Vec3
      target: Vec3
      fov: number
      easing: 'linear' | 'smooth' | 'step'
      blockedBy?: string[]
    }> = []

    // Clear existing camera keys first if requested
    if (clearExistingKeys && before.cameraKeys?.length) {
      for (const existing of before.cameraKeys) {
        operations.push({ op: 'removeCameraKeyframe', time: existing.time })
      }
    }

    // Resolve orbit keyframes
    if (orbitRaw) {
      const steps =
        orbitRaw.steps !== undefined
          ? asFiniteNumber(orbitRaw.steps, 'orbit.steps', 2, 24)
          : 5
      if (!Number.isInteger(steps)) {
        throw new SceneToolError('orbit.steps must be an integer between 2 and 24.')
      }
      const startTime =
        orbitRaw.startTime !== undefined
          ? asFiniteNumber(orbitRaw.startTime, 'orbit.startTime', 0, 3600)
          : 0
      const endTime =
        orbitRaw.endTime !== undefined
          ? asFiniteNumber(orbitRaw.endTime, 'orbit.endTime', 0, 3600)
          : before.settings.duration
      if (endTime <= startTime) {
        throw new SceneToolError('orbit.endTime must be greater than orbit.startTime.')
      }
      const startAz =
        orbitRaw.startAzimuth !== undefined
          ? asFiniteNumber(orbitRaw.startAzimuth, 'orbit.startAzimuth')
          : 0
      const endAz =
        orbitRaw.endAzimuth !== undefined
          ? asFiniteNumber(orbitRaw.endAzimuth, 'orbit.endAzimuth')
          : 360
      const elevation =
        orbitRaw.elevation !== undefined
          ? asFiniteNumber(orbitRaw.elevation, 'orbit.elevation', -89, 89)
          : 20
      const easing =
        orbitRaw.easing === 'linear' ||
        orbitRaw.easing === 'smooth' ||
        orbitRaw.easing === 'step'
          ? orbitRaw.easing
          : 'smooth'
      const objectIds = Array.isArray(orbitRaw.objectIds)
        ? orbitRaw.objectIds.filter((s): s is string => typeof s === 'string' && s.length > 0)
        : undefined
      const distance =
        orbitRaw.distance !== undefined
          ? asFiniteNumber(orbitRaw.distance, 'orbit.distance', 0.01, 100000)
          : undefined
      const fill =
        orbitRaw.fill !== undefined
          ? asFiniteNumber(orbitRaw.fill, 'orbit.fill', 0.05, 1.5)
          : undefined
      const fov =
        orbitRaw.fov !== undefined
          ? asFiniteNumber(orbitRaw.fov, 'orbit.fov', 10, 120)
          : undefined

      for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1)
        const time = Math.round((startTime + (endTime - startTime) * t) * 1000) / 1000
        const azimuth = startAz + (endAz - startAz) * t
        const spec = shotSchema.parse({
          ...(objectIds?.length ? { objectIds } : {}),
          azimuth,
          elevation,
          ...(distance !== undefined ? { distance } : {}),
          ...(fill !== undefined ? { fill } : {}),
          ...(fov !== undefined ? { fov } : {}),
        })
        const framed = resolveShot(spec, 16 / 9)
        authoredKeys.push({ time, easing, ...framed })
      }
    }

    // Resolve explicit shot sequence
    for (const rawShot of shotsRaw) {
      if (!isPlainObject(rawShot)) {
        throw new SceneToolError('Each entry in shots must be an object.')
      }
      const time = asFiniteNumber(rawShot.time, 'shots[].time', 0, 3600)
      const easing =
        rawShot.easing === 'linear' ||
        rawShot.easing === 'smooth' ||
        rawShot.easing === 'step'
          ? rawShot.easing
          : 'smooth'
      const spec = shotSchema.parse(rawShot.shot)
      const framed = resolveShot(spec, 16 / 9)
      authoredKeys.push({ time, easing, ...framed })
    }

    const maxKeyTime = authoredKeys.reduce((m, k) => Math.max(m, k.time), 0)
    const explicitDuration =
      args.duration !== undefined
        ? asFiniteNumber(args.duration, 'duration', 0.1, 3600)
        : undefined
    const targetDuration = Math.max(
      before.settings.duration,
      explicitDuration ?? 0,
      maxKeyTime,
    )
    if (
      explicitDuration !== undefined ||
      targetDuration > before.settings.duration
    ) {
      operations.push({
        op: 'settings',
        settings: {
          duration: explicitDuration !== undefined
            ? Math.max(explicitDuration, maxKeyTime)
            : targetDuration,
        },
      } as Operation)
    }

    for (const key of authoredKeys) {
      operations.push({
        op: 'cameraKeyframe',
        keyframe: {
          time: key.time,
          position: key.position,
          target: key.target,
          fov: key.fov,
          easing: key.easing,
        },
      })
    }

    if (operations.length > 0) {
      ctx.store.edit(operations)
    }

    // Hero shot sets and persists editing camera
    let heroCamera: Record<string, unknown> | undefined
    if (heroShotSpec) {
      const aspect = ctx.viewport.current
        ? ctx.viewport.current.aspect()
        : 16 / 9
      const { blockedBy, ...camera } = resolveShot(heroShotSpec, aspect)
      ctx.store.setCamera(camera)
      ctx.store.persistCamera()
      heroCamera = {
        ...cameraReply(camera),
        ...(blockedBy ? { blockedBy } : {}),
      }
    }

    // Transient workspace preview controls
    const workspacePatch: Record<string, unknown> = {}
    if (typeof args.cameraPreview === 'boolean') {
      workspacePatch.cameraPreview = args.cameraPreview
    }
    if (typeof args.playing === 'boolean') {
      workspacePatch.playing = args.playing
    }
    if (args.time !== undefined) {
      workspacePatch.time = asFiniteNumber(args.time, 'time', 0)
    }
    if (Object.keys(workspacePatch).length > 0) {
      ctx.store.workspace(workspacePatch)
    }

    // Save if any durable scene/camera state changed
    const didMutate = operations.length > 0 || heroShotSpec !== undefined
    const path = didMutate ? await ctx.document.save() : ctx.document.doc.path

    // Optional preview verification renders (up to 4 views, never alters saved camera)
    let images: Array<{ mimeType: 'image/png' | 'image/jpeg'; data: string }> | undefined
    let capturedViews: Array<Record<string, unknown>> | undefined
    let captureNote: string | undefined
    if (capturePreview) {
      if (!ctx.viewport.current) {
        captureNote = 'Viewport renderer unavailable; preview capture skipped.'
      } else {
        const aspectName = asString(args.aspect) as
          | (typeof ASPECTS)[number]
          | undefined
        const size =
          typeof args.size === 'number' &&
          Number.isInteger(args.size) &&
          args.size >= 256 &&
          args.size <= 2048
            ? args.size
            : undefined
        const sampleViews: Array<{ position: Vec3; target: Vec3; fov: number }> = []
        if (heroCamera) {
          sampleViews.push({
            position: heroCamera.position as Vec3,
            target: heroCamera.target as Vec3,
            fov: (heroCamera.fov as number | undefined) ?? 45,
          })
        }
        if (authoredKeys.length > 0) {
          const maxSamples = Math.max(0, 4 - sampleViews.length)
          if (maxSamples > 0) {
            const stride = Math.max(1, Math.floor(authoredKeys.length / maxSamples))
            for (
              let i = 0;
              i < authoredKeys.length && sampleViews.length < 4;
              i += stride
            ) {
              const k = authoredKeys[i]!
              sampleViews.push({
                position: k.position,
                target: k.target,
                fov: k.fov,
              })
            }
          }
        }
        const snapTime = ctx.store.getSnapshot().time
        const rendered: Array<{ mimeType: 'image/png' | 'image/jpeg'; data: string }> = []
        if (sampleViews.length === 0) {
          const png = await ctx.viewport.current.capture(snapTime, {
            aspect: aspectName,
            size,
          })
          rendered.push({ mimeType: 'image/png', data: png.split(',')[1] })
        } else {
          capturedViews = []
          for (const view of sampleViews) {
            const png = await ctx.viewport.current.capture(snapTime, {
              aspect: aspectName,
              size,
              view,
            })
            rendered.push({ mimeType: 'image/png', data: png.split(',')[1] })
            capturedViews.push(cameraReply(view))
          }
        }
        images = rendered
        captureNote = `Rendered ${rendered.length} preview still(s)${aspectName ? ` at ${aspectName}` : ''}.`
      }
    }

    const state = ctx.store.getSnapshot()
    const blockedShots = authoredKeys
      .filter(k => k.blockedBy && k.blockedBy.length > 0)
      .map(k => ({ time: k.time, blockedBy: k.blockedBy }))

    const changes = changesReply(diffScenes(before, state.scene))

    return {
      mutated: didMutate,
      ...(images ? { images } : {}),
      summary: `Directed camera${heroCamera ? ' (hero shot saved)' : ''}${authoredKeys.length ? ` with ${authoredKeys.length} camera keyframe(s)` : ''}${images ? ` and captured ${images.length} preview(s)` : ''}.`,
      data: {
        ok: true,
        path,
        scene: sceneHeader(state.scene),
        workspace: workspaceState(state),
        camera: cameraReply(ctx.store.getCameraSnapshot()),
        ...(heroCamera ? { heroShot: heroCamera } : {}),
        ...(authoredKeys.length
          ? {
              authoredCameraKeys: authoredKeys.map(k => ({
                time: k.time,
                easing: k.easing,
                ...cameraReply(k),
                ...(k.blockedBy ? { blockedBy: k.blockedBy } : {}),
              })),
            }
          : {}),
        ...(blockedShots.length ? { blockedShots } : {}),
        ...(capturedViews ? { capturedViews } : {}),
        ...(captureNote ? { captureNote } : {}),
        changes,
        canUndo: state.canUndo,
        canRedo: state.canRedo,
      },
    }
  },
})

export const PURE3D_FUNCTIONS: readonly AppFunctionDefinition<Pure3DAgentContext>[] =
  [
    fnInspectSceneHealth,
    fnComposeScene,
    fnSetupLightingAndLook,
    fnStyleMaterialsAndTextures,
    fnDirectCameraAndShots,
  ]
