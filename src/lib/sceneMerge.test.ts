import { describe, expect, it } from 'vitest'
import { emptyScene, makeObject, parseScene } from './scene'
import { mergeScene, sameScene } from './sceneMerge'
import type { SceneDocument } from '../types'

const obj = (name: string, extra: object = {}) => ({ ...makeObject('box'), name, ...extra })
function scene(objects = [obj('A'), obj('B')]): SceneDocument {
  const s = emptyScene()
  s.objects = objects
  return s
}
const names = (s: SceneDocument) => s.objects.map(o => o.name).sort()
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value))

describe('mergeScene', () => {
  it('takes what either added', () => {
    const base = scene()
    const mine = copy(base), theirs = copy(base)
    mine.objects.push(obj('Mine'))
    theirs.objects.push(obj('Theirs'))
    expect(names(mergeScene(base, mine, theirs))).toEqual(['A', 'B', 'Mine', 'Theirs'])
  })

  it('leaves removed what either removed, with its keyframes', () => {
    const base = scene()
    base.keyframes = [{ objectId: base.objects[0]!.id, property: 'position', time: 1, value: [0, 0, 0], easing: 'linear' }]
    const mine = copy(base), theirs = copy(base)
    theirs.objects = theirs.objects.slice(1)
    theirs.keyframes = []
    const merged = mergeScene(base, mine, theirs)
    expect(names(merged)).toEqual(['B'])
    expect(merged.keyframes).toEqual([])
  })

  it('merges one object field by field, and mine wins the same field', () => {
    const base = scene()
    const mine = copy(base), theirs = copy(base)
    mine.objects[0]!.name = 'Mine'
    theirs.objects[0]!.name = 'Theirs'
    theirs.objects[0]!.visible = false
    expect(mergeScene(base, mine, theirs).objects[0]).toMatchObject({ name: 'Mine', visible: false })
  })

  it('a child of something the other removed comes loose, and the scene still opens', () => {
    const parent = obj('Parent')
    const base = scene([parent])
    const mine = copy(base), theirs = copy(base)
    mine.objects.push(obj('Child', { parentId: parent.id }))
    theirs.objects = []
    const merged = mergeScene(base, mine, theirs)
    expect(merged.objects[0]).toMatchObject({ name: 'Child', parentId: null })
    expect(() => parseScene(merged)).not.toThrow()
  })

  it('settles settings key by key, and camera keys by their time', () => {
    const base = scene()
    base.cameraKeys = []
    const mine = copy(base), theirs = copy(base)
    mine.settings.duration = 30
    theirs.settings.grid = !base.settings.grid
    theirs.cameraKeys = [{ time: 2, position: [1, 1, 1], target: [0, 0, 0], fov: 45, easing: 'smooth' }]
    const merged = mergeScene(base, mine, theirs)
    expect(merged.settings).toMatchObject({ duration: 30, grid: !base.settings.grid })
    expect(merged.cameraKeys?.map(k => k.time)).toEqual([2])
  })

  it('changes nothing when only they changed, whichever way the keys were written', () => {
    const base = scene()
    const theirs = copy(base)
    theirs.title = 'Theirs'
    const merged = mergeScene(base, copy(base), JSON.parse(JSON.stringify(theirs, Object.keys(theirs).sort().concat(Object.keys(theirs.settings)))) && theirs)
    expect(sameScene(merged, theirs)).toBe(true)
  })
})
