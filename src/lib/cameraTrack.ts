import type { SceneDocument, Vec3 } from '../types'

export function cameraPose(scene: SceneDocument, time: number) {
  const keys = [...(scene.cameraKeys ?? [])].sort((a, b) => a.time - b.time)
  const first = keys[0]
  if (!first) return { ...scene.settings.camera, fov: scene.settings.camera.fov ?? 45 }
  if (time <= first.time) return first
  const right = keys.findIndex(k => k.time > time)
  if (right < 0) return keys[keys.length - 1]!
  const a = keys[right - 1]!, b = keys[right]!
  let t = (time - a.time) / (b.time - a.time)
  if (a.easing === 'step') t = 0
  else if (a.easing === 'smooth') t = t * t * (3 - 2 * t)
  const mix = (x: Vec3, y: Vec3) => x.map((v, i) => v + (y[i] - v) * t) as Vec3
  const position = mix(a.position, b.position), target = mix(a.target, b.target)
  // Crossing paths must not leave lookAt with a zero-length direction.
  if (Math.hypot(...target.map((n, i) => n - position[i])) < 1e-6) {
    for (let i = 0; i < 3; i++) target[i] = position[i] + a.target[i] - a.position[i]
  }
  return { position, target, fov: a.fov + (b.fov - a.fov) * t }
}
