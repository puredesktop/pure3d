import { expect, it } from 'vitest'
import { emptyScene } from './scene'
import { sceneShots, VIEWS } from './shotList'

it('starts from the saved view, then the camera keys in order of time', () => {
  const scene = emptyScene()
  scene.settings.camera = { position: [1, 2, 3], target: [0, 0, 0], fov: 30 }
  scene.cameraKeys = [
    { time: 75, position: [5, 5, 5], target: [0, 1, 0], fov: 40, easing: 'linear' },
    { time: 3, position: [9, 9, 9], target: [0, 0, 1], fov: 50, easing: 'linear' },
  ]
  expect(sceneShots(scene).map(s => s.label)).toEqual(['Saved view', 'Shot 1 · 0:03', 'Shot 2 · 1:15'])
  expect(sceneShots(scene)[1]!.camera.position).toEqual([9, 9, 9])
  expect(sceneShots(scene)[0]!.camera.fov).toBe(30)
})

it('has the saved view alone when the camera has no keys, at the default lens if it names none', () => {
  const scene = emptyScene()
  delete scene.settings.camera.fov
  expect(sceneShots(scene).map(s => [s.label, s.camera.fov])).toEqual([['Saved view', 45]])
})

it('offers the angles any scene has', () => {
  expect(VIEWS.map(v => v.label)).toEqual(['Three-quarter', 'Front', 'Side', 'Top'])
})
