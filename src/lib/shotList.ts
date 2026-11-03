import { cameraPose } from './cameraTrack'
import type { SceneDocument, ShotSpec } from '../types'

/** Where to look from, for someone looking the scene over: the angles any scene has, framed on all of it. */
export const VIEWS: ReadonlyArray<{ id: string; label: string; spec: ShotSpec }> = [
  { id: 'three-quarter', label: 'Three-quarter', spec: { azimuth: 35, elevation: 18 } },
  { id: 'front', label: 'Front', spec: { azimuth: 0, elevation: 5 } },
  { id: 'side', label: 'Side', spec: { azimuth: 90, elevation: 5 } },
  { id: 'top', label: 'Top', spec: { azimuth: 0, elevation: 89 } },
]

export interface SceneShot {
  id: string
  label: string
  camera: { position: [number, number, number]; target: [number, number, number]; fov: number }
}

const clock = (seconds: number) => {
  const whole = Math.round(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/** The scene's own shots: the view it was saved with, then each of its camera's keyframes by time. */
export function sceneShots(scene: SceneDocument): SceneShot[] {
  const saved = scene.settings.camera
  const keys = [...(scene.cameraKeys ?? [])].sort((a, b) => a.time - b.time)
  return [
    { id: 'saved', label: 'Saved view', camera: { position: saved.position, target: saved.target, fov: saved.fov ?? 45 } },
    ...keys.map((key, index) => {
      const pose = cameraPose(scene, key.time)
      return { id: `key-${key.time}`, label: `Shot ${index + 1} · ${clock(key.time)}`, camera: { position: pose.position, target: pose.target, fov: pose.fov } }
    }),
  ]
}
