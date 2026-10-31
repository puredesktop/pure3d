import * as THREE from 'three'
import type { ShotSpec, Vec3 } from '../types'

/** A camera: where it is, what it looks at, and its vertical field of view in degrees. */
export type Shot = { position: Vec3; target: Vec3; fov: number }
/** A shot and the objects standing between its camera and its subject (by id), if any. */
export type FramedShot = Shot & { blockedBy?: string[] }

/** Width over height for an aspect name such as '16:9'. */
export function aspectRatio(aspect: string): number {
  const [w, h] = aspect.split(':').map(Number)
  return w! / h!
}

/** The direction from a subject to a camera at azimuth (0 = +z, 90 = +x) and elevation, both in degrees. */
export function shotDirection(azimuth: number, elevation: number): THREE.Vector3 {
  const a = THREE.MathUtils.degToRad(azimuth), e = THREE.MathUtils.degToRad(elevation)
  return new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a))
}

/**
 * A camera for a shot spec. An explicit position and target are kept as given. Otherwise the camera looks at the
 * subject's bounding sphere from the spec's direction, far enough back that the sphere fills `fill` of the narrower
 * side of a frame of this aspect (or at the spec's exact distance).
 */
export function frameShot(spec: ShotSpec, subject: THREE.Sphere, aspect: number, fallbackFov = 45): Shot {
  const fov = spec.fov ?? fallbackFov
  if (spec.position && spec.target) return { position: [...spec.position], target: [...spec.target], fov }
  const radius = Math.max(subject.radius, 0.05)
  const halfVertical = THREE.MathUtils.degToRad(fov) / 2
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * aspect)
  const half = Math.min(halfVertical, halfHorizontal)
  const fill = spec.fill ?? 0.85
  const distance = spec.distance ?? radius / Math.sin(half) / fill
  const target = subject.center.clone()
  const position = target.clone().addScaledVector(shotDirection(spec.azimuth ?? 35, spec.elevation ?? 18), distance)
  const round = (v: THREE.Vector3) => v.toArray().map(n => Math.round(n * 1000) / 1000) as Vec3
  return { position: round(position), target: round(target), fov }
}

/**
 * The scene objects (by id) that stand between a camera and what it looks at, nearest first: a ray from the camera to
 * the target, stopping short of the subject's own sphere. Hidden things, light markers and the subject's own objects
 * do not count.
 */
export function blockers(root: THREE.Object3D, shot: Shot, subjectRadius: number, subjectIds: ReadonlySet<string>): string[] {
  const from = new THREE.Vector3(...shot.position)
  const to = new THREE.Vector3(...shot.target)
  const length = from.distanceTo(to) - subjectRadius * 0.9
  if (length <= 0) return []
  const raycaster = new THREE.Raycaster(from, to.clone().sub(from).normalize(), 0, length)
  const seen: string[] = []
  for (const hit of raycaster.intersectObject(root, true)) {
    let shown = true
    let id: string | undefined
    for (let node: THREE.Object3D | null = hit.object; node; node = node.parent) {
      if (!node.visible || node.userData.helper) shown = false
      id ??= node.userData.pure3dId as string | undefined
    }
    if (shown && id && !subjectIds.has(id) && !seen.includes(id)) seen.push(id)
  }
  return seen
}
