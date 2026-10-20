import * as THREE from 'three'
import { descendants } from './scene'
import type { WorkspaceState, CameraState } from './SceneStore'
import type { SceneDocument, SceneObject, Vec3 } from '../types'

/**
 * Compact agent-tool replies. Change tools describe what happened instead of
 * echoing the scene; `getScene` (optionally filtered) is the detailed read.
 */

export const ID_CAP = 25
export const OUTLINE_CAP = 20
export const SUMMARY_LIMIT = 200

type Reply = Record<string, unknown>

/** Put up to `cap` ids under `key`, and the remainder count under `${key}More`. */
export function cappedIds(key: string, ids: readonly string[], cap = ID_CAP): Reply {
  if (!ids.length) return {}
  return ids.length > cap
    ? { [key]: ids.slice(0, cap), [`${key}More`]: ids.length - cap }
    : { [key]: [...ids] }
}

export function sceneHeader(scene: SceneDocument) {
  return {
    id: scene.id,
    title: scene.title,
    objects: scene.objects.length,
    keyframes: scene.keyframes.length,
    cameraKeys: scene.cameraKeys?.length ?? 0,
    textureAssets: scene.textureAssets.length,
    duration: scene.settings.duration,
  }
}

export function workspaceState(state: WorkspaceState) {
  return {
    selectedId: state.selectedId,
    selectedVertex: state.selectedVertex,
    time: state.time,
    playing: state.playing,
    loop: state.loop,
    mode: state.mode,
    inspector: state.inspector,
    cameraPreview: state.cameraPreview,
  }
}

const outlineEntry = (object: SceneObject) => ({
  id: object.id,
  name: object.name,
  kind: object.kind,
  ...(object.parentId ? { parentId: object.parentId } : {}),
  ...(object.visible ? {} : { visible: false }),
})

export function sceneOutline(scene: SceneDocument, cap = OUTLINE_CAP): Reply {
  const objects = scene.objects.slice(0, cap).map(outlineEntry)
  return {
    outline: objects,
    ...(scene.objects.length > cap ? { outlineMore: scene.objects.length - cap } : {}),
  }
}

export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (!sameValue(a[i], b[i])) return false
    return true
  }
  if (Array.isArray(b)) return false
  const ak = Object.keys(a).filter(k => (a as Reply)[k] !== undefined)
  const bk = Object.keys(b).filter(k => (b as Reply)[k] !== undefined)
  if (ak.length !== bk.length) return false
  return ak.every(k => sameValue((a as Reply)[k], (b as Reply)[k]))
}

type Counts = { added?: number; removed?: number; changed?: number }

export type SceneChanges = {
  added: string[]
  updated: string[]
  removed: string[]
  keyframes: Counts
  cameraKeys: Counts
  textureAssetsAdded: string[]
  textureAssetsRemoved: string[]
  settings: string[]
  title?: string
}

function diffKeyed<T>(before: readonly T[], after: readonly T[], key: (item: T) => string): Counts {
  const old = new Map(before.map(item => [key(item), item]))
  const counts = { added: 0, removed: 0, changed: 0 }
  const seen = new Set<string>()
  for (const item of after) {
    const id = key(item)
    seen.add(id)
    const previous = old.get(id)
    if (previous === undefined) counts.added++
    else if (!sameValue(previous, item)) counts.changed++
  }
  for (const id of old.keys()) if (!seen.has(id)) counts.removed++
  return Object.fromEntries(Object.entries(counts).filter(([, n]) => n)) as Counts
}

export function diffScenes(before: SceneDocument, after: SceneDocument): SceneChanges {
  const old = new Map(before.objects.map(o => [o.id, o]))
  const current = new Set(after.objects.map(o => o.id))
  const added: string[] = []
  const updated: string[] = []
  if (before !== after)
    for (const object of after.objects) {
      const previous = old.get(object.id)
      if (!previous) added.push(object.id)
      else if (previous !== object && !sameValue(previous, object)) updated.push(object.id)
    }
  const oldAssets = new Set(before.textureAssets.map(a => a.id))
  const newAssets = new Set(after.textureAssets.map(a => a.id))
  const settingsKeys = new Set([...Object.keys(before.settings), ...Object.keys(after.settings)])
  return {
    added,
    updated,
    removed: before.objects.filter(o => !current.has(o.id)).map(o => o.id),
    keyframes: diffKeyed(before.keyframes, after.keyframes, k => `${k.objectId}/${k.property}/${k.time}`),
    cameraKeys: diffKeyed(before.cameraKeys ?? [], after.cameraKeys ?? [], k => String(k.time)),
    textureAssetsAdded: [...newAssets].filter(id => !oldAssets.has(id)),
    textureAssetsRemoved: [...oldAssets].filter(id => !newAssets.has(id)),
    settings: [...settingsKeys].filter(
      key =>
        !sameValue(
          before.settings[key as keyof SceneDocument['settings']],
          after.settings[key as keyof SceneDocument['settings']],
        ),
    ),
    ...(before.title !== after.title ? { title: after.title } : {}),
  }
}

/** The `changes` object of a reply: empty sections omitted, id lists capped. */
export function changesReply(changes: SceneChanges): Reply {
  return {
    ...cappedIds('added', changes.added),
    ...cappedIds('updated', changes.updated),
    ...cappedIds('removed', changes.removed),
    ...(Object.keys(changes.keyframes).length ? { keyframes: changes.keyframes } : {}),
    ...(Object.keys(changes.cameraKeys).length ? { cameraKeys: changes.cameraKeys } : {}),
    ...cappedIds('textureAssetsAdded', changes.textureAssetsAdded),
    ...cappedIds('textureAssetsRemoved', changes.textureAssetsRemoved),
    ...(changes.settings.length ? { settings: changes.settings } : {}),
    ...(changes.title !== undefined ? { title: changes.title } : {}),
  }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const named = (verb: string, ids: string[]) =>
  ids.length === 1
    ? `${verb} ${ids[0]}`
    : `${verb} ${plural(ids.length, 'object')} (${ids.slice(0, 3).join(', ')}${ids.length > 3 ? ', …' : ''})`
const counted = (label: string, counts: Counts) =>
  Object.entries(counts).map(([kind, n]) => `${label} ${kind} ${n}`).join(', ')

/** One line describing a set of changes, for history entries. */
export function describeChanges(changes: SceneChanges): string {
  const parts = [
    changes.added.length ? named('added', changes.added) : '',
    changes.updated.length ? named('updated', changes.updated) : '',
    changes.removed.length ? named('removed', changes.removed) : '',
    counted('keyframes', changes.keyframes),
    counted('camera keys', changes.cameraKeys),
    changes.textureAssetsAdded.length ? `textures added ${changes.textureAssetsAdded.length}` : '',
    changes.textureAssetsRemoved.length ? `textures removed ${changes.textureAssetsRemoved.length}` : '',
    changes.settings.length ? `settings ${changes.settings.join('/')}` : '',
    changes.title !== undefined ? `title "${changes.title}"` : '',
  ].filter(Boolean)
  return parts.length ? parts.join('; ') : 'no content change'
}

export const HISTORY_ENTRIES = 5

/** Short descriptions of the nearest undo and redo steps (nearest first). */
export function historyEntries(
  current: SceneDocument,
  past: readonly SceneDocument[],
  future: readonly SceneDocument[],
  limit = HISTORY_ENTRIES,
) {
  const undo: string[] = []
  for (let i = 0; i < Math.min(limit, past.length); i++) {
    const after = i === 0 ? current : past[past.length - i]
    undo.push(describeChanges(diffScenes(past[past.length - 1 - i], after)))
  }
  const redo: string[] = []
  for (let i = 0; i < Math.min(limit, future.length); i++) {
    const before = i === 0 ? current : future[future.length - i]
    redo.push(describeChanges(diffScenes(before, future[future.length - 1 - i])))
  }
  return { undo, redo, undoSteps: past.length, redoSteps: future.length }
}

export type SceneQuery = {
  ids?: string[]
  includeDescendants?: boolean
  kinds?: SceneObject['kind'][]
  name?: string
  within?: { min: Vec3; max: Vec3 }
  summary?: boolean
  geometry?: boolean
  limit?: number
}

export const isEmptyQuery = (query: SceneQuery) =>
  Object.values(query).every(value => value === undefined)

/** World-space origin of every object from its saved (rest) transforms. */
export function worldOrigins(scene: SceneDocument): Map<string, Vec3> {
  const byId = new Map(scene.objects.map(o => [o.id, o]))
  const matrices = new Map<string, THREE.Matrix4>()
  const world = (object: SceneObject): THREE.Matrix4 => {
    const cached = matrices.get(object.id)
    if (cached) return cached
    const { position, rotation, scale } = object.transform
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation, 'XYZ')),
      new THREE.Vector3(...scale),
    )
    const parent = object.parentId ? byId.get(object.parentId) : undefined
    const matrix = parent ? world(parent).clone().multiply(local) : local
    matrices.set(object.id, matrix)
    return matrix
  }
  return new Map(
    scene.objects.map(o => {
      const e = world(o).elements
      return [o.id, [e[12], e[13], e[14]] as Vec3]
    }),
  )
}

export function filterObjects(scene: SceneDocument, query: SceneQuery) {
  let ids: Set<string> | null = null
  const missingIds: string[] = []
  if (query.ids) {
    const known = new Set(scene.objects.map(o => o.id))
    ids = new Set<string>()
    for (const id of query.ids) {
      if (!known.has(id)) missingIds.push(id)
      else if (query.includeDescendants) for (const d of descendants(scene, id)) ids.add(d)
      else ids.add(id)
    }
  }
  const kinds = query.kinds ? new Set(query.kinds) : null
  const name = query.name?.toLowerCase()
  const origins = query.within ? worldOrigins(scene) : null
  const inside = (id: string) => {
    const point = origins!.get(id)!
    return point.every((n, i) => n >= query.within!.min[i] && n <= query.within!.max[i])
  }
  const objects = scene.objects.filter(
    o =>
      (!ids || ids.has(o.id)) &&
      (!kinds || kinds.has(o.kind)) &&
      (!name || o.name.toLowerCase().includes(name)) &&
      (!origins || inside(o.id)),
  )
  return { objects, missingIds }
}

const geometrySummary = (geometry: NonNullable<SceneObject['geometry']>) => ({
  vertices: geometry.positions.length / 3,
  triangles: (geometry.indices?.length ?? geometry.positions.length / 3) / 3,
  uv: !!geometry.uv,
})

/**
 * Filtered or summary read of the scene. Called only when at least one query
 * argument is present; an argument-less getScene stays the full read.
 */
export function queryScene(state: WorkspaceState, query: SceneQuery, extra: Reply) {
  const { scene } = state
  const { objects: matched, missingIds } = filterObjects(scene, query)
  const limit = query.limit ?? (query.summary ? SUMMARY_LIMIT : matched.length)
  const objects = matched.slice(0, limit)
  const more = matched.length - objects.length
  const filtered = !!(query.ids || query.kinds || query.name || query.within)
  const match = {
    objects: matched.length,
    totalObjects: scene.objects.length,
    ...cappedIds('missingIds', missingIds),
  }
  if (query.summary) {
    const byKind: Record<string, number> = {}
    for (const o of scene.objects) byKind[o.kind] = (byKind[o.kind] ?? 0) + 1
    return {
      scene: {
        id: scene.id,
        title: scene.title,
        settings: scene.settings,
        counts: {
          objects: scene.objects.length,
          byKind,
          keyframes: scene.keyframes.length,
          cameraKeys: scene.cameraKeys?.length ?? 0,
          textureAssets: scene.textureAssets.length,
        },
        ...cappedIds('textureAssetIds', scene.textureAssets.map(a => a.id)),
      },
      objects: objects.map(outlineEntry),
      ...(more ? { objectsMore: more } : {}),
      ...(filtered ? { match } : {}),
      ...workspaceState(state),
      canUndo: state.canUndo,
      canRedo: state.canRedo,
      ...extra,
    }
  }
  const kept = new Set(objects.map(o => o.id))
  return {
    ...state,
    scene: {
      ...scene,
      objects:
        query.geometry === false
          ? objects.map(o => (o.geometry ? { ...o, geometry: geometrySummary(o.geometry) } : o))
          : objects,
      keyframes: scene.keyframes.filter(k => kept.has(k.objectId)),
    },
    ...(more ? { objectsMore: more } : {}),
    match,
    ...extra,
  }
}

export const cameraReply = (camera: CameraState) => ({
  position: camera.position,
  target: camera.target,
  ...(camera.fov !== undefined ? { fov: camera.fov } : {}),
})
