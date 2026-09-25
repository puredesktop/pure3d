import * as THREE from 'three'
import { moveVertex, type MeshGeometry } from './geometry'
import { disposeScene } from './threeScene'
import type { Vec3 } from '../types'

/** Disposable viewport preview; the store commits the final position once per drag. */
export class VertexHandles {
  readonly pivot = new THREE.Object3D()
  readonly points: THREE.Points
  constructor(
    readonly mesh: THREE.Mesh,
    readonly geometry: MeshGeometry,
    readonly index: number,
  ) {
    const markers = new THREE.BufferGeometry()
    markers.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(geometry.positions, 3),
    )
    this.points = new THREE.Points(
      markers,
      new THREE.PointsMaterial({
        color: '#87b4dd',
        size: 6,
        sizeAttenuation: false,
        depthTest: false,
      }),
    )
    this.points.renderOrder = 10
    this.pivot.position.fromArray(geometry.positions, index * 3)
    const selected = new THREE.Points(
      new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.Float32BufferAttribute([0, 0, 0], 3),
      ),
      new THREE.PointsMaterial({
        color: '#ffce83',
        size: 10,
        sizeAttenuation: false,
        depthTest: false,
      }),
    )
    selected.renderOrder = 11
    this.pivot.add(selected)
    mesh.add(this.points, this.pivot)
  }
  preview() {
    const positions = moveVertex(
      this.geometry,
      this.index,
      this.pivot.position.toArray() as Vec3,
    ).positions
    const attribute = this.mesh.geometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute
    attribute.copyArray(positions)
    attribute.needsUpdate = true
    this.mesh.geometry.computeVertexNormals()
    this.mesh.geometry.computeBoundingBox()
    this.mesh.geometry.computeBoundingSphere()
    const markers = this.points.geometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute
    markers.copyArray(positions)
    markers.needsUpdate = true
    this.points.geometry.computeBoundingBox()
    this.points.geometry.computeBoundingSphere()
  }
  dispose() {
    const attribute = this.mesh.geometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute
    attribute.copyArray(this.geometry.positions)
    attribute.needsUpdate = true
    this.mesh.geometry.computeVertexNormals()
    this.mesh.geometry.computeBoundingBox()
    this.mesh.geometry.computeBoundingSphere()
    this.points.removeFromParent()
    this.pivot.removeFromParent()
    disposeScene(this.points)
    disposeScene(this.pivot)
  }
}
