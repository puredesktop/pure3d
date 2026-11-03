import type { SceneDocument } from '../types'

/**
 * What two copies of a scene come to. `base` is the file as this copy last agreed with it, `mine` is this copy's scene, and
 * `theirs` is the file as another copy left it. A change either made stays. Where both changed one thing, `mine` wins, being
 * the one about to be saved. Lists merge by what identifies an entry: an entry one removed stays removed, unless the other
 * added it; nothing is taken as removed merely for being absent from a copy that never knew of it.
 */
const same = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))

/** Sorted keys, so that two equal objects read as equal whichever way they were built. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]))
  return value
}

export const sameScene = (a: SceneDocument, b: SceneDocument) => same(a, b)

function pick<T>(base: T, mine: T, theirs: T): T {
  return same(mine, base) ? theirs : mine
}

function fields<T extends object>(base: T, mine: T, theirs: T): T {
  const keys = new Set([...Object.keys(base), ...Object.keys(mine), ...Object.keys(theirs)]) as Set<keyof T & string>
  const merged = {} as T
  for (const key of keys) {
    const value = pick(base[key], mine[key], theirs[key])
    if (value !== undefined) merged[key] = value
  }
  return merged
}

function byKey<T>(base: readonly T[], mine: readonly T[], theirs: readonly T[], key: (item: T) => string, join: (b: T, m: T, t: T) => T): T[] {
  const index = (items: readonly T[]) => new Map(items.map(item => [key(item), item]))
  const inBase = index(base), inMine = index(mine), inTheirs = index(theirs)
  const merged: T[] = []
  for (const item of theirs) {
    const k = key(item), had = inBase.get(k), own = inMine.get(k)
    if (own !== undefined && had !== undefined) merged.push(join(had, own, item))
    else if (own !== undefined) merged.push(own)
    // Not in mine: I removed it if I knew of it, and it is theirs alone if I did not.
    else if (had === undefined) merged.push(item)
  }
  for (const item of mine) if (!inTheirs.has(key(item)) && !inBase.has(key(item))) merged.push(item)
  return merged
}

export function mergeScene(base: SceneDocument, mine: SceneDocument, theirs: SceneDocument): SceneDocument {
  const objects = byKey(base.objects, mine.objects, theirs.objects, o => o.id, fields)
  const ids = new Set(objects.map(o => o.id))
  // What held to something the other removed comes loose rather than leaving a scene that will not open.
  const held = objects.map(o => (o.parentId && !ids.has(o.parentId) ? { ...o, parentId: null } : o))
  const whole = <T>(_b: T, m: T, t: T) => (same(m, _b) ? t : m)
  const keyframes = byKey(base.keyframes, mine.keyframes, theirs.keyframes, k => `${k.objectId}|${k.property}|${k.time}`, whole)
    .filter(k => ids.has(k.objectId))
    .sort((a, b) => a.time - b.time)
  const cameraKeys = byKey(base.cameraKeys ?? [], mine.cameraKeys ?? [], theirs.cameraKeys ?? [], k => String(k.time), whole).sort((a, b) => a.time - b.time)
  const usingCameraKeys = theirs.cameraKeys !== undefined || mine.cameraKeys !== undefined
  return {
    ...theirs,
    title: pick(base.title, mine.title, theirs.title),
    textureAssets: byKey(base.textureAssets, mine.textureAssets, theirs.textureAssets, t => t.id, whole),
    objects: held,
    keyframes,
    ...(usingCameraKeys ? { cameraKeys } : {}),
    settings: fields(base.settings, mine.settings, theirs.settings),
  }
}
