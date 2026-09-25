import { expect, it } from 'vitest'
import { emptyScene, applyOperations, parseScene } from './scene'
import { cameraPose } from './cameraTrack'
import { SceneStore } from './SceneStore'

const a = { time: 0, position: [0, 0, 10], target: [0, 0, 0], fov: 40, easing: 'linear' }
const b = { ...a, time: 5, position: [10, 0, 10], fov: 80 }
it('interpolates camera position and lens, holds endpoints, and round trips', () => {
  const scene = applyOperations(emptyScene(), [{ op: 'cameraKeyframe', keyframe: a }, { op: 'cameraKeyframe', keyframe: b }])
  expect(cameraPose(scene, 2.5)).toMatchObject({ position: [5, 0, 10], target: [0, 0, 0], fov: 60 })
  expect(cameraPose(scene, -1).fov).toBe(40)
  expect(cameraPose(scene, 100).fov).toBe(80)
  expect(parseScene(JSON.parse(JSON.stringify(scene))).cameraKeys).toEqual(scene.cameraKeys)
})
it('supports smooth/step easing and validates keyframes atomically', () => {
  const scene = applyOperations(emptyScene(), [{ op: 'cameraKeyframe', keyframe: { ...a, easing: 'smooth' } }, { op: 'cameraKeyframe', keyframe: b }])
  expect(cameraPose(scene, 1.25).position[0]).toBeCloseTo(1.5625)
  const stepped = applyOperations(scene, [{ op: 'cameraKeyframe', keyframe: { ...a, easing: 'step' } }])
  expect(cameraPose(stepped, 4).position).toEqual(a.position)
  expect(() => applyOperations(scene, [{ op: 'settings', settings: { duration: 1 } }])).toThrow()
  expect(() => applyOperations(scene, [{ op: 'cameraKeyframe', keyframe: { ...a, fov: 180 } }])).toThrow()
})
it('preview does not overwrite the editor camera and camera edits support undo', () => {
  const store = new SceneStore(), before = store.getCameraSnapshot()
  store.edit([{ op: 'cameraKeyframe', keyframe: a }])
  store.workspace({ cameraPreview: true, time: 2 })
  expect(store.getCameraSnapshot()).toEqual(before)
  store.edit([{ op: 'removeCameraKeyframe', time: 0 }])
  expect(store.getDocument().cameraKeys).toHaveLength(0)
  store.history('undo')
  expect(store.getDocument().cameraKeys).toHaveLength(1)
})
