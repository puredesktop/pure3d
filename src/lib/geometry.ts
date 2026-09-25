import * as THREE from 'three'
import type { SceneObject, Vec3 } from '../types'

export type MeshGeometry = NonNullable<SceneObject['geometry']>

export function createGeometry(object: SceneObject): THREE.BufferGeometry {
  switch (object.kind) {
    case 'box':
      return new THREE.BoxGeometry(1, 1, 1)
    case 'sphere':
      return new THREE.SphereGeometry(0.5, 32, 16)
    case 'cylinder':
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 32)
    case 'cone':
      return new THREE.ConeGeometry(0.5, 1, 32)
    case 'torus':
      return new THREE.TorusGeometry(0.35, 0.15, 16, 48)
    case 'plane':
      return new THREE.PlaneGeometry(1, 1)
    case 'mesh': {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(object.geometry!.positions, 3),
      )
      if (object.geometry!.indices) geometry.setIndex(object.geometry!.indices)
      if (object.geometry!.uv)
        geometry.setAttribute(
          'uv',
          new THREE.Float32BufferAttribute(object.geometry!.uv, 2),
        )
      geometry.computeVertexNormals()
      return geometry
    }
    default:
      return new THREE.BufferGeometry()
  }
}

export function geometryData(geometry: THREE.BufferGeometry): MeshGeometry {
  const uv = geometry.getAttribute('uv')
  return {
    positions: Array.from(geometry.getAttribute('position').array),
    indices: geometry.index ? Array.from(geometry.index.array) : null,
    ...(uv ? { uv: Array.from(uv.array) } : {}),
  }
}

export function meshGeometry(
  object: SceneObject,
  subdivide = false,
): MeshGeometry {
  if (object.kind === 'group') throw new Error('Select a shape to model')
  const geometry = createGeometry(object)
  try {
    if (!subdivide) return geometryData(geometry)
    if (
      (geometry.index?.count ?? geometry.getAttribute('position').count) * 12 >
      300000
    )
      throw new Error('Subdivision exceeds the mesh vertex limit')
    // Split every edge at its midpoint so adjacent triangles cannot form T-junctions.
    const split = (
      attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
    ) => {
      const result: number[] = []
      const count = geometry.index?.count ?? attribute.count
      for (let i = 0; i < count; i += 3) {
        const vertices = [0, 1, 2].map(n =>
          Array.from({ length: attribute.itemSize }, (_, axis) =>
            attribute.getComponent(geometry.index?.getX(i + n) ?? i + n, axis),
          ),
        )
        for (const [a, b] of [
          [0, 1],
          [1, 2],
          [2, 0],
        ])
          vertices.push(
            vertices[a].map((value, axis) => (value + vertices[b][axis]) / 2),
          )
        for (const vertex of [0, 3, 5, 3, 1, 4, 5, 4, 2, 3, 4, 5])
          result.push(...vertices[vertex])
      }
      return result
    }
    const uv = geometry.getAttribute('uv')
    return {
      positions: split(geometry.getAttribute('position')),
      indices: null,
      ...(uv ? { uv: split(uv) } : {}),
    }
  } finally {
    geometry.dispose()
  }
}

/** Move coincident vertices together, preserving split vertices at UV/normal seams. */
export function moveVertex(
  geometry: MeshGeometry,
  index: number,
  position: Vec3,
): MeshGeometry {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index * 3 >= geometry.positions.length
  )
    throw new Error('Unknown vertex')
  const next = structuredClone(geometry)
  const original = geometry.positions.slice(index * 3, index * 3 + 3)
  for (let v = 0; v < next.positions.length; v += 3)
    if (original.every((n, axis) => n === geometry.positions[v + axis]))
      next.positions.splice(v, 3, ...position)
  return next
}

/** Per-triangle box projection supplies UV seams for meshes imported without UVs. */
export function boxUV(geometry: MeshGeometry): MeshGeometry {
  const positions = geometry.indices
    ? geometry.indices.flatMap(i => geometry.positions.slice(i * 3, i * 3 + 3))
    : [...geometry.positions]
  const bounds = new THREE.Box3().setFromArray(positions)
  const size = bounds.getSize(new THREE.Vector3()).toArray()
  const min = bounds.min.toArray()
  const uv: number[] = []
  for (let i = 0; i < positions.length; i += 9) {
    const a = new THREE.Vector3().fromArray(positions, i)
    const normal = new THREE.Vector3()
      .fromArray(positions, i + 3)
      .sub(a)
      .cross(new THREE.Vector3().fromArray(positions, i + 6).sub(a))
      .toArray()
      .map(Math.abs)
    const dominant = normal.indexOf(Math.max(...normal))
    const axes = dominant === 0 ? [2, 1] : dominant === 1 ? [0, 2] : [0, 1]
    for (let v = i; v < i + 9; v += 3)
      for (const axis of axes)
        uv.push((positions[v + axis] - min[axis]) / (size[axis] || 1))
  }
  return { positions, indices: null, uv }
}
