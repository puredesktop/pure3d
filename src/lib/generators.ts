import * as THREE from 'three'
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { generatorParams } from './generatorSpecs.mjs'
import { leafAtlas, ATLAS } from './leafAtlas'
import { dressWater } from './water'
import { extendShader } from './shaderHooks'
import type { SceneDocument, SceneObject } from '../types'

/**
 * Shapes made from a generator's parameters (terrain, scatter, tree, rock, water, rounded box). Everything is seeded,
 * so the same parameters always make the same shape. Colours are vertex colours, tinted by the object's material
 * colour; foliage uses alpha-tested leaf cards from the shared leaf atlas.
 */

type Params = Record<string, number | string>
const num = (params: Params, key: string) => Number(params[key])
const str = (params: Params, key: string) => String(params[key])

/** A small, fast seeded random generator (mulberry32). */
export function seeded(seed: number): () => number {
  let a = Math.floor(seed * 2654435761) >>> 0 || 1
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const noiseFor = (seed: number) => new SimplexNoise({ random: seeded(seed) })
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-6)))
  return t * t * (3 - 2 * t)
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const color = (hex: string) => new THREE.Color(hex)

/**
 * Every builder part carries the same attributes, so parts merge into one geometry. uv: where in the leaf atlas every
 * vertex samples (the solid patch by default); null keeps the part's own UVs (cards). surface: 1 where the material's
 * surface (bark, stone) shows, 0 where it does not (leaf cards and the dark inner canopy).
 */
function prepare(geometry: THREE.BufferGeometry, tint: THREE.Color | ((p: THREE.Vector3, n: THREE.Vector3) => THREE.Color), uv: readonly [number, number] | null = ATLAS.solid, surface = uv ? 1 : 0): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry
  if (g !== geometry) geometry.dispose()
  if (!g.getAttribute('normal')) g.computeVertexNormals()
  const position = g.getAttribute('position')
  const normal = g.getAttribute('normal')
  const colors = new Float32Array(position.count * 3)
  const p = new THREE.Vector3(), n = new THREE.Vector3()
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i); n.fromBufferAttribute(normal, i)
    const c = typeof tint === 'function' ? tint(p, n) : tint
    colors.set([c.r, c.g, c.b], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  g.setAttribute('surfaceMask', new THREE.BufferAttribute(new Float32Array(position.count).fill(surface), 1))
  if (uv || !g.getAttribute('uv')) {
    const uvs = new Float32Array(position.count * 2)
    for (let i = 0; i < position.count; i++) uvs.set(uv ?? ATLAS.solid, i * 2)
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  }
  return g
}
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false)
  for (const part of parts) part.dispose()
  if (!merged) throw new Error('Could not build that shape')
  return merged
}

// ─── Terrain ────────────────────────────────────────────────────────────────

/**
 * A terrain's height at a point in its own coordinates (x, z in metres from its centre). The centre is at height 0, so
 * things placed at y = 0 stand on the ground in the middle (and in a clearing); hills rise and dips fall around it.
 */
export function terrainField(input: Params): (x: number, z: number) => number {
  const params = generatorParams('terrain', input)
  const noise = noiseFor(num(params, 'seed'))
  const feature = num(params, 'feature'), height = num(params, 'height'), gain = 0.32 + num(params, 'roughness') * 0.4
  const clearing = num(params, 'clearing')
  const raw = (x: number, z: number) => {
    let frequency = 1 / feature, amplitude = 1, sum = 0, norm = 0
    for (let octave = 0; octave < 6; octave++) {
      sum += amplitude * noise.noise(x * frequency + octave * 17.3, z * frequency - octave * 9.1)
      norm += amplitude
      amplitude *= gain
      frequency *= 2.03
    }
    return (sum / norm * 0.5 + 0.5) * height
  }
  const centre = raw(0, 0)
  return (x, z) => {
    const h = raw(x, z) - centre
    if (clearing <= 0) return h
    return h * smoothstep(clearing * 0.85, clearing * 1.9, Math.hypot(x, z))
  }
}

function terrainGeometry(input: Params): THREE.BufferGeometry {
  const params = generatorParams('terrain', input)
  const width = num(params, 'width'), depth = num(params, 'depth'), height = Math.max(num(params, 'height'), 1e-3)
  const segments = Math.round(num(params, 'segments'))
  const sx = width >= depth ? segments : Math.max(8, Math.round(segments * width / depth))
  const sz = depth >= width ? segments : Math.max(8, Math.round(segments * depth / width))
  const geometry = new THREE.PlaneGeometry(width, depth, sx, sz)
  geometry.rotateX(-Math.PI / 2)
  const field = terrainField(params)
  const position = geometry.getAttribute('position')
  for (let i = 0; i < position.count; i++) position.setY(i, field(position.getX(i), position.getZ(i)))
  geometry.computeVertexNormals()
  const patches = noiseFor(num(params, 'seed') + 101)
  const grass = color(str(params, 'grass')), soil = color(str(params, 'soil')), rock = color(str(params, 'rock')), snow = color(str(params, 'snow'))
  const dryGrass = grass.clone().lerp(color('#a39a52'), 0.45), lushGrass = grass.clone().multiplyScalar(0.72)
  const snowLine = num(params, 'snowLine')
  let lowest = Infinity
  for (let i = 0; i < position.count; i++) lowest = Math.min(lowest, position.getY(i))
  const normal = geometry.getAttribute('normal')
  const colors = new Float32Array(position.count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i)
    const slope = 1 - normal.getY(i)
    const patch = patches.noise(x * 0.09, z * 0.09) * 0.6 + patches.noise(x * 0.4, z * 0.4) * 0.4
    c.copy(grass).lerp(patch > 0 ? dryGrass : lushGrass, Math.abs(patch) * 0.9)
    c.lerp(soil, smoothstep(0.55, 0.85, patches.noise(x * 0.05 + 40, z * 0.05)) * 0.8)
    c.lerp(soil, smoothstep(0.12, 0.3, slope))
    c.lerp(rock, smoothstep(0.28, 0.5, slope + patch * 0.06))
    if (snowLine < 1) c.lerp(snow, smoothstep(snowLine - 0.04, snowLine + 0.04, (y - lowest) / height + patch * 0.05) * (1 - smoothstep(0.45, 0.7, slope)))
    colors.set([c.r, c.g, c.b], i * 3)
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

// ─── Trees, bushes and ground cover ─────────────────────────────────────────

function trunk(height: number, radius: number, bark: THREE.Color, random: () => number, white = false, bend = 1): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(radius * 0.45, radius, height, 9, 6, true)
  geometry.translate(0, height / 2, 0)
  const position = geometry.getAttribute('position')
  const lean = (random() - 0.5) * 0.08 * height * bend, phase = random() * 6
  for (let i = 0; i < position.count; i++) {
    const t = position.getY(i) / height
    position.setX(i, position.getX(i) + Math.sin(t * 2.4 + phase) * lean * t)
    position.setZ(i, position.getZ(i) + Math.cos(t * 1.9 + phase) * lean * t)
    // a root flare at the base
    const flare = 1 + (1 - smoothstep(0, 0.08, t)) * 0.6
    position.setX(i, position.getX(i) * flare)
    position.setZ(i, position.getZ(i) * flare)
  }
  geometry.computeVertexNormals()
  const marks = noiseFor(Math.floor(random() * 1e5))
  return prepare(geometry, p => {
    if (!white) return bark.clone().multiplyScalar(0.85 + marks.noise(p.x * 9, p.y * 3) * 0.15)
    const band = marks.noise(p.y * 7, Math.atan2(p.z, p.x) * 1.5)
    return band > 0.3 ? color('#2d2a26') : color('#b3aea4').multiplyScalar(0.85 + band * 0.12)
  })
}

/** A cluster of leaf cards on a blob of canopy, lit as a volume (normals point out from the blob's centre). */
function leafCards(centre: THREE.Vector3, radius: number, count: number, size: number, leaves: THREE.Color, random: () => number, region: 'leaves' | 'needles', droop = 0, depth: readonly [number, number] = [0.55, 1.05]): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = []
  const [u0, u1] = region === 'leaves' ? ATLAS.leaves : ATLAS.needles
  for (let i = 0; i < count; i++) {
    const direction = new THREE.Vector3(random() * 2 - 1, random() * 1.6 - 0.5, random() * 2 - 1).normalize()
    const at = centre.clone().addScaledVector(direction, radius * lerp(depth[0], depth[1], random()))
    const card = new THREE.PlaneGeometry(size * (0.8 + random() * 0.5), size * (0.8 + random() * 0.5))
    const uv = card.getAttribute('uv')
    for (let v = 0; v < uv.count; v++) uv.setX(v, lerp(u0, u1, uv.getX(v)))
    card.rotateX(random() * Math.PI - droop)
    card.rotateY(random() * Math.PI * 2)
    card.rotateZ((random() - 0.5) * 1.2)
    card.translate(at.x, at.y, at.z)
    const position = card.getAttribute('position')
    const normals = new Float32Array(position.count * 3)
    const p = new THREE.Vector3()
    for (let v = 0; v < position.count; v++) {
      p.fromBufferAttribute(position, v).sub(centre).normalize().lerp(new THREE.Vector3(0, 1, 0), 0.25).normalize()
      normals.set([p.x, p.y, p.z], v * 3)
    }
    card.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
    // leaves deep in the crown get less light
    const inside = 1 - Math.min(1, at.distanceTo(centre) / Math.max(radius, 1e-3))
    const shade = (0.8 + random() * 0.28 + (at.y - centre.y) / Math.max(radius, 1e-3) * 0.12) * (1 - inside * 0.55)
    const tone = leaves.clone().offsetHSL((random() - 0.5) * 0.03, 0, 0).multiplyScalar(shade)
    parts.push(prepare(card, tone, null))
  }
  return parts
}

/** A dark, lumpy inner volume so canopies read as full from every angle. */
function canopyCore(centre: THREE.Vector3, radius: number, leaves: THREE.Color, random: () => number, squash = 0.85): THREE.BufferGeometry {
  const geometry = mergeVertices(new THREE.IcosahedronGeometry(radius, 2).deleteAttribute('normal').deleteAttribute('uv'))
  const noise = noiseFor(Math.floor(random() * 1e5))
  const position = geometry.getAttribute('position')
  const p = new THREE.Vector3()
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i)
    const bump = 1 + noise.noise3d(p.x * 2.2 / radius, p.y * 2.2 / radius, p.z * 2.2 / radius) * 0.22
    position.setXYZ(i, p.x * bump + centre.x, p.y * bump * squash + centre.y, p.z * bump + centre.z)
  }
  geometry.computeVertexNormals()
  return prepare(geometry, leaves.clone().multiplyScalar(0.55), ATLAS.solid, 0)
}

function tree(style: string, height: number, leavesHex: string, barkHex: string, fullness: number, seed: number): THREE.BufferGeometry {
  const random = seeded(seed * 7 + 3)
  const leaves = color(leavesHex), bark = color(barkHex)
  const parts: THREE.BufferGeometry[] = []
  if (style === 'pine' || style === 'fir') {
    const fir = style === 'fir'
    const crownBase = height * (fir ? 0.08 : 0.32)
    const spread = height * (fir ? 0.2 : 0.17) * fullness
    parts.push(trunk(height * 0.9, height * 0.022, bark, random, false, 0.15))
    // a dark inner cone so the crown is never see-through
    const core = new THREE.ConeGeometry(spread * 0.5, height - crownBase, 10, 6)
    core.translate(0, crownBase + (height - crownBase) / 2, 0)
    parts.push(prepare(core, leaves.clone().multiplyScalar(0.3), ATLAS.solid, 0))
    const whorls = Math.round((fir ? 18 : 15) * Math.sqrt(fullness))
    for (let w = 0; w < whorls; w++) {
      const t = w / whorls
      const y = lerp(crownBase, height * 0.98, t)
      const reach = spread * Math.pow(1 - t, fir ? 0.85 : 0.75) + height * 0.02
      const branches = 6 + Math.floor(random() * 3)
      for (let b = 0; b < branches; b++) {
        const angle = (b / branches) * Math.PI * 2 + random() * 0.6 + w * 0.7
        const length = reach * (0.85 + random() * 0.35)
        const droop = -(0.15 + random() * 0.25) - t * 0.1
        const shade = 0.75 + random() * 0.3 + t * 0.3
        const tone = leaves.clone().offsetHSL((random() - 0.5) * 0.02, 0, 0).multiplyScalar(shade)
        // two cards crossed at ±45° along each branch, so it reads as a bough from the side and from above
        for (const tilt of [0.75, -0.75]) {
          const card = new THREE.PlaneGeometry(length, length * (fir ? 0.8 : 0.7))
          const uv = card.getAttribute('uv')
          for (let v = 0; v < uv.count; v++) uv.setX(v, lerp(ATLAS.needles[0], ATLAS.needles[1], uv.getX(v)))
          card.translate(length / 2, 0, 0)
          card.rotateX(-Math.PI / 2 + tilt + (random() - 0.5) * 0.3)
          card.rotateZ(droop)
          card.rotateY(angle)
          card.translate(0, y, 0)
          const normals = new Float32Array(card.getAttribute('position').count * 3)
          for (let v = 0; v < normals.length / 3; v++) normals.set([Math.cos(angle) * 0.55, 0.8, -Math.sin(angle) * 0.55], v * 3)
          card.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
          parts.push(prepare(card, tone, null))
        }
      }
    }
    return merge(parts)
  }
  if (style === 'bush') {
    const radius = height * 0.55 * fullness
    for (let i = 0; i < 4; i++) {
      const centre = new THREE.Vector3((random() - 0.5) * radius, radius * (0.55 + random() * 0.25), (random() - 0.5) * radius)
      const r = radius * (0.55 + random() * 0.25)
      parts.push(canopyCore(centre, r * 0.5, leaves.clone().multiplyScalar(0.6), random, 0.8))
      parts.push(...leafCards(centre, r, Math.round(34 * fullness), r * 0.6, leaves, random, 'leaves'))
      parts.push(...leafCards(centre, r, Math.round(14 * fullness), r * 0.5, leaves, random, 'leaves', 0, [0.25, 0.6]))
    }
    return merge(parts)
  }
  const birch = style === 'birch'
  const trunkHeight = height * (birch ? 0.92 : 0.7)
  parts.push(trunk(trunkHeight, height * (birch ? 0.015 : 0.035), birch ? color('#b3aea4') : bark, random, birch))
  const crown = height * (birch ? 0.2 : 0.3) * fullness
  const top = new THREE.Vector3(0, height - crown * 0.85, 0)
  const blobs = birch ? 6 : 6 + Math.floor(random() * 3)
  for (let i = 0; i < blobs; i++) {
    const angle = random() * Math.PI * 2
    const out = i === 0 ? 0 : crown * (0.55 + random() * 0.35)
    const centre = top.clone().add(new THREE.Vector3(Math.cos(angle) * out, (random() - 0.6) * crown * (birch ? 1.6 : 0.8), Math.sin(angle) * out))
    const r = crown * (i === 0 ? 0.8 : 0.5 + random() * 0.2)
    if (i > 0) {
      // a branch from the trunk to this part of the crown
      const from = new THREE.Vector3(0, trunkHeight * (0.55 + random() * 0.25), 0)
      const length = from.distanceTo(centre)
      const branch = new THREE.CylinderGeometry(height * 0.006, height * 0.014, length, 6, 1, true)
      branch.translate(0, length / 2, 0)
      branch.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), centre.clone().sub(from).normalize()))
      branch.translate(from.x, from.y, from.z)
      parts.push(prepare(branch, birch ? color('#8f8a80') : bark))
    }
    // a small dark core keeps the crown from looking hollow; leaves inside it and on its shell do the rest
    if (!birch) parts.push(canopyCore(centre, r * 0.42, leaves.clone().multiplyScalar(0.55), random))
    parts.push(...leafCards(centre, r, Math.round((birch ? 50 : 84) * fullness), r * (birch ? 0.6 : 0.7), leaves, random, 'leaves', birch ? 0.5 : 0))
    parts.push(...leafCards(centre, r, Math.round((birch ? 16 : 34) * fullness), r * 0.55, leaves, random, 'leaves', birch ? 0.5 : 0, [0.2, 0.6]))
  }
  return merge(parts)
}

/** A cupped flower: rounded petals around a small centre, facing up. */
function flowerHead(radius: number, petals: number): THREE.BufferGeometry {
  const positions: number[] = []
  const steps = petals * 6
  const rim = (i: number) => {
    const a = (i / steps) * Math.PI * 2
    // each petal is a rounded lobe: wide at its middle, pinched between petals
    const r = radius * (0.35 + 0.65 * Math.pow(Math.abs(Math.sin((a * petals) / 2)), 0.6))
    return [Math.cos(a) * r, (r / radius) * radius * 0.3, Math.sin(a) * r]
  }
  for (let i = 0; i < steps; i++) positions.push(0, 0, 0, ...rim(i + 1), ...rim(i))
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

function grass(height: number, random: () => number, tint: THREE.Color, flowers?: THREE.Color): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const blades = 16
  for (let i = 0; i < blades; i++) {
    const h = height * (0.55 + random() * 0.6), w = height * 0.035
    const bend = (random() - 0.5) * 0.8
    const blade = new THREE.BufferGeometry()
    const positions: number[] = []
    const steps = 3
    for (let s = 0; s < steps; s++) {
      const y0 = (s / steps) * h, y1 = ((s + 1) / steps) * h
      const w0 = w * (1 - s / steps), w1 = w * (1 - (s + 1) / steps)
      const x0 = bend * Math.pow(s / steps, 2) * h * 0.4, x1 = bend * Math.pow((s + 1) / steps, 2) * h * 0.4
      positions.push(x0 - w0, y0, 0, x0 + w0, y0, 0, x1 + w1, y1, 0, x0 - w0, y0, 0, x1 + w1, y1, 0, x1 - w1, y1, 0)
    }
    blade.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    blade.rotateY(random() * Math.PI * 2)
    blade.translate((random() - 0.5) * height * 0.35, 0, (random() - 0.5) * height * 0.35)
    const normals = new Float32Array(positions.length)
    for (let v = 0; v < normals.length / 3; v++) normals.set([0, 1, 0], v * 3)
    blade.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
    parts.push(prepare(blade, (p) => tint.clone().multiplyScalar(0.45 + 0.75 * (p.y / height))))
    if (flowers && i % 4 === 0) {
      const head = flowerHead(height * 0.06, 5 + Math.floor(random() * 3))
      head.rotateX((random() - 0.5) * 0.6)
      head.rotateY(random() * Math.PI)
      const top = blade.getAttribute('position')
      const tip = new THREE.Vector3().fromBufferAttribute(top, top.count - 2)
      head.translate(tip.x, tip.y, tip.z)
      parts.push(prepare(head, (p) => (p.distanceTo(tip) < height * 0.012 ? color('#e0a526') : flowers.clone().multiplyScalar(0.9 + random() * 0.2))))
    }
  }
  return merge(parts)
}

function fern(size: number, random: () => number, tint: THREE.Color): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const fronds = 7
  for (let i = 0; i < fronds; i++) {
    const length = size * (0.8 + random() * 0.4)
    const frond = new THREE.PlaneGeometry(length, length * 0.42, 4, 1)
    const uv = frond.getAttribute('uv')
    for (let v = 0; v < uv.count; v++) uv.setX(v, lerp(ATLAS.needles[0], ATLAS.needles[1], uv.getX(v)))
    frond.translate(length / 2, 0, 0)
    frond.rotateX(-Math.PI / 2)
    const position = frond.getAttribute('position')
    for (let v = 0; v < position.count; v++) {
      const t = position.getX(v) / length
      position.setY(v, Math.sin(t * Math.PI * 0.85) * length * 0.45 - t * t * length * 0.15)
    }
    frond.rotateY((i / fronds) * Math.PI * 2 + random() * 0.4)
    frond.computeVertexNormals()
    parts.push(prepare(frond, tint.clone().multiplyScalar(0.7 + random() * 0.3), null))
  }
  return merge(parts)
}

function rock(size: number, craggy: number, flatness: number, stoneHex: string, moss: number, seed: number): THREE.BufferGeometry {
  const geometry = mergeVertices(new THREE.IcosahedronGeometry(1, 5).deleteAttribute('normal').deleteAttribute('uv'))
  const noise = noiseFor(seed * 13 + 5)
  const random = seeded(seed * 5 + 1)
  const position = geometry.getAttribute('position')
  const p = new THREE.Vector3()
  const stretch = new THREE.Vector3(1 + noise.noise(seed, 1) * 0.25, 1 - flatness, 1 + noise.noise(1, seed) * 0.25)
  // split faces: a few planes cut the lump flat, as weathered boulders break along joints
  const cuts = Array.from({ length: 5 + Math.round(craggy * 7) }, () => ({
    normal: new THREE.Vector3(random() * 2 - 1, random() * 1.6 - 0.4, random() * 2 - 1).normalize(),
    at: 0.78 + random() * 0.18,
  }))
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i)
    let d = 0, f = 1.1, a = 0.22 * (0.4 + craggy)
    for (let o = 0; o < 3; o++) { d += noise.noise3d(p.x * f, p.y * f, p.z * f) * a; f *= 2.2; a *= 0.4 }
    p.multiplyScalar(1 + d)
    for (const cut of cuts) {
      const over = p.dot(cut.normal) - cut.at
      // a soft cut: flat across the face, rounded where it meets the next one
      if (over > 0) p.addScaledVector(cut.normal, -over * 0.85)
    }
    p.multiply(stretch)
    position.setXYZ(i, p.x * size * 0.5, Math.max(p.y, -0.6) * size * 0.5, p.z * size * 0.5)
  }
  let lowest = Infinity
  for (let i = 0; i < position.count; i++) lowest = Math.min(lowest, position.getY(i))
  geometry.translate(0, -lowest - size * 0.08, 0)
  geometry.computeVertexNormals()
  const stone = color(stoneHex), mossy = color('#56702f')
  const grain = noiseFor(seed + 77)
  return prepare(geometry, (q, n) => {
    const g = grain.noise3d(q.x * 3 / size, q.y * 3 / size, q.z * 3 / size)
    const c = stone.clone().multiplyScalar(0.82 + g * 0.18)
    return c.lerp(mossy, smoothstep(0.45, 0.8, n.y + g * 0.15) * moss)
  })
}

function polarDisc(rings: number, segments: number): THREE.BufferGeometry {
  const positions: number[] = []
  const at = (ring: number, segment: number) => {
    const r = ring / rings, a = (segment / segments) * Math.PI * 2
    return [Math.cos(a) * r, 0, Math.sin(a) * r]
  }
  for (let ring = 0; ring < rings; ring++)
    for (let segment = 0; segment < segments; segment++) {
      const a = at(ring, segment), b = at(ring + 1, segment), c = at(ring + 1, segment + 1), d = at(ring, segment + 1)
      if (ring === 0) positions.push(...a, ...c, ...b)
      else positions.push(...a, ...c, ...b, ...a, ...d, ...c)
    }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return geometry
}

function water(input: Params): THREE.BufferGeometry {
  const params = generatorParams('water', input)
  const width = num(params, 'width'), depth = num(params, 'depth'), waves = num(params, 'waves')
  const geometry = str(params, 'shape') === 'round' ? polarDisc(48, 128) : new THREE.PlaneGeometry(2, 2, 128, 128).rotateX(-Math.PI / 2).toNonIndexed()
  geometry.scale(width / 2, 1, depth / 2)
  const noise = noiseFor(num(params, 'seed'))
  const position = geometry.getAttribute('position')
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), z = position.getZ(i)
    const swell = Math.sin(x * 0.7 + z * 0.3) * 0.5 + noise.noise(x * 0.35, z * 0.35) * 0.35 + noise.noise(x * 1.7, z * 1.7) * 0.15
    // a few centimetres up, so a pond at y = 0 lies over flat ground without flickering into it
    position.setY(i, 0.04 + swell * waves * 0.5)
  }
  const merged = mergeVertices(geometry)
  merged.computeVertexNormals()
  geometry.dispose()
  const deep = color(str(params, 'water')), shallow = deep.clone().lerp(color('#7fa89a'), 0.45)
  const coloured = prepare(merged, p => {
    const edge = Math.hypot(p.x / (width / 2), p.z / (depth / 2))
    return deep.clone().lerp(shallow, smoothstep(0.7, 1, edge))
  })
  // planar UVs so a texture can be laid on the surface
  const uv = coloured.getAttribute('uv')
  const pos = coloured.getAttribute('position')
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / width + 0.5, pos.getZ(i) / depth + 0.5)
  coloured.userData.water = { width, depth, waves, level: 0.04 }
  return coloured
}

/** The single-item geometry a tree or a scatter places (also what the tree generator draws). */
export function itemGeometry(item: string, size: number, seed: number, tint: THREE.Color, petals?: THREE.Color): THREE.BufferGeometry {
  const random = seeded(seed)
  switch (item) {
    case 'pine': return tree('pine', 9 * size, '#2f5a33', '#4b3a2c', 1, seed)
    case 'fir': return tree('fir', 8 * size, '#244b3a', '#3f3127', 1, seed)
    case 'broadleaf': return tree('broadleaf', 7 * size, '#4f7a2c', '#5a4330', 1, seed)
    case 'birch': return tree('birch', 8 * size, '#7f9a3b', '#e9e6de', 0.9, seed)
    case 'bush': return tree('bush', 1.2 * size, '#3f6a2a', '#4a3a2a', 1, seed)
    case 'rock': return rock(0.9 * size, 0.55, 0.35, '#8a8478', 0.3, seed)
    case 'grass': return grass(0.45 * size, random, tint.clone().multiply(color('#6d8f3a')))
    case 'flowers': return grass(0.5 * size, random, color('#5d8337'), petals ?? color('#ffffff'))
    case 'fern': return fern(0.7 * size, random, color('#4f7f2f'))
    default: throw new Error(`Unknown scatter item: ${item}`)
  }
}

// ─── Scatter ────────────────────────────────────────────────────────────────

/** An object's saved world matrix (parents and saved transforms; animation ignored). */
export function savedWorldMatrix(document: SceneDocument, id: string): THREE.Matrix4 {
  const matrix = new THREE.Matrix4()
  let current = document.objects.find(object => object.id === id)
  const chain: SceneObject[] = []
  while (current) {
    chain.unshift(current)
    const parent: string | null = current.parentId
    current = parent ? document.objects.find(object => object.id === parent) : undefined
  }
  for (const object of chain) {
    const { position, rotation, scale } = object.transform
    matrix.multiply(new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale)))
  }
  return matrix
}

/** The water a scatter keeps out of: each visible water object's footprint, in its own space. */
function waterFootprints(document: SceneDocument) {
  return document.objects
    .filter(item => item.kind === 'water' && item.visible)
    .map(item => {
      const params = generatorParams('water', item.params)
      return { id: item.id, params, toLocal: savedWorldMatrix(document, item.id).invert() }
    })
}

/** What a scatter depends on besides its own parameters: the terrain it sits on, water it keeps out of, and where all are. */
export function scatterDependency(document: SceneDocument, object: SceneObject): string {
  const on = object.params?.on
  const terrain = on ? document.objects.find(item => item.id === on && item.kind === 'terrain') : undefined
  const water = waterFootprints(document).map(item => [item.params, item.toLocal.elements])
  if (!terrain && !water.length) return ''
  return JSON.stringify([terrain?.params, terrain && savedWorldMatrix(document, terrain.id).elements, savedWorldMatrix(document, object.id).elements, water])
}

function scatter(document: SceneDocument | null, object: SceneObject): THREE.InstancedMesh {
  const params = generatorParams('scatter', object.params)
  const seed = num(params, 'seed'), count = Math.round(num(params, 'count'))
  const random = seeded(seed * 31 + 11)
  const tint = color(str(params, 'color'))
  const geometry = itemGeometry(str(params, 'item'), 1, seed, tint, tint)
  const material = new THREE.MeshStandardMaterial()
  const mesh = new THREE.InstancedMesh(geometry, material, count)
  const width = num(params, 'width'), depth = num(params, 'depth')
  const avoid = num(params, 'avoid'), clumping = num(params, 'clumping'), variation = num(params, 'variation')
  const minScale = Math.min(num(params, 'minScale'), num(params, 'maxScale')), maxScale = Math.max(num(params, 'minScale'), num(params, 'maxScale'))
  const maxSlope = Math.cos(THREE.MathUtils.degToRad(num(params, 'maxSlope')))
  const density = noiseFor(seed + 900)
  const terrain = document && params.on ? document.objects.find(item => item.id === params.on && item.kind === 'terrain') : undefined
  const field = terrain ? terrainField(terrain.params ?? {}) : null
  const terrainSize = terrain ? generatorParams('terrain', terrain.params) : null
  const toWorld = document && terrain ? savedWorldMatrix(document, object.id) : null
  const terrainMatrix = document && terrain ? savedWorldMatrix(document, terrain.id) : null
  const fromWorld = toWorld ? toWorld.clone().invert() : null
  const toTerrain = terrainMatrix ? terrainMatrix.clone().invert() : null
  const lean = ['rock', 'grass', 'flowers', 'fern'].includes(str(params, 'item')) ? 0.25 : 0.05
  // nothing grows in a pond: skip points over any water's surface (with a little margin for banks)
  const waters = document ? waterFootprints(document) : []
  const scatterMatrix = document && waters.length ? savedWorldMatrix(document, object.id) : null
  const inWater = (x: number, z: number) => {
    if (!scatterMatrix) return false
    const world = new THREE.Vector3(x, 0, z).applyMatrix4(scatterMatrix)
    return waters.some(({ params: water, toLocal }) => {
      const local = world.clone().applyMatrix4(toLocal)
      const rx = Math.abs(local.x) / (num(water, 'width') / 2), rz = Math.abs(local.z) / (num(water, 'depth') / 2)
      return str(water, 'shape') === 'round' ? Math.hypot(rx, rz) < 1.04 : Math.max(rx, rz) < 1.02
    })
  }
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), m = new THREE.Matrix4(), c = new THREE.Color()
  let placed = 0
  for (let attempt = 0; attempt < count * 40 && placed < count; attempt++) {
    const x = (random() - 0.5) * width, z = (random() - 0.5) * depth
    if (avoid > 0 && Math.hypot(x, z) < avoid * (0.85 + random() * 0.3)) continue
    if (inWater(x, z)) continue
    if (clumping > 0) {
      const d = density.noise(x * 0.08, z * 0.08) * 0.7 + density.noise(x * 0.25, z * 0.25) * 0.3
      if (random() > 1 - clumping * (0.5 - d * 0.5) * 1.6) continue
    }
    let y = 0
    let tilt = new THREE.Vector3(0, 1, 0)
    if (field && terrainSize && toWorld && fromWorld && toTerrain && terrainMatrix) {
      const local = new THREE.Vector3(x, 0, z).applyMatrix4(toWorld).applyMatrix4(toTerrain)
      if (Math.abs(local.x) > num(terrainSize, 'width') / 2 || Math.abs(local.z) > num(terrainSize, 'depth') / 2) continue
      const e = 0.25
      const h = field(local.x, local.z)
      const normal = new THREE.Vector3(field(local.x - e, local.z) - field(local.x + e, local.z), 2 * e, field(local.x, local.z - e) - field(local.x, local.z + e)).normalize()
      if (normal.y < maxSlope) continue
      tilt = normal
      const back = new THREE.Vector3(local.x, h, local.z).applyMatrix4(terrainMatrix).applyMatrix4(fromWorld)
      y = back.y
    }
    const scale = lerp(minScale, maxScale, Math.pow(random(), 1.6))
    const squash = 1 + (random() - 0.5) * 0.25
    p.set(x, y - scale * 0.03, z)
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI * 2)
    const lay = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0).lerp(tilt, lean).normalize())
    q.copy(lay).multiply(turn)
    s.set(scale * squash, scale / squash, scale * (2 - squash))
    mesh.setMatrixAt(placed, m.compose(p, q, s))
    c.setHSL(0, 0, 1).offsetHSL((random() - 0.5) * 0.06 * variation, 0, 0).multiplyScalar(1 + (random() - 0.5) * 0.5 * variation)
    if (str(params, 'item') !== 'flowers' && str(params, 'item') !== 'grass') c.multiply(tint)
    mesh.setColorAt(placed, c)
    placed++
  }
  mesh.count = placed
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.computeBoundingBox()
  mesh.computeBoundingSphere()
  return mesh
}

// ─── Entry points ───────────────────────────────────────────────────────────

/** The geometry of a generated object other than a scatter (which is instanced: see generatedNode). */
export function generatedGeometry(object: SceneObject): THREE.BufferGeometry {
  const params = generatorParams(object.kind, object.params)
  switch (object.kind) {
    case 'terrain': return terrainGeometry(params)
    case 'tree': {
      const geometry = tree(str(params, 'style'), num(params, 'height'), str(params, 'leaves'), str(params, 'bark'), num(params, 'fullness'), num(params, 'seed'))
      geometry.userData.leafAtlas = true
      return geometry
    }
    case 'rock': return rock(num(params, 'size'), num(params, 'roughness'), num(params, 'flatness'), str(params, 'stone'), num(params, 'moss'), num(params, 'seed'))
    case 'water': return water(params)
    case 'roundedBox': return new RoundedBoxGeometry(1, 1, 1, Math.round(num(params, 'segments')), Math.min(num(params, 'radius'), 0.5))
    default: throw new Error(`${object.kind} is not a generated shape`)
  }
}

const FOLIAGE = new Set(['pine', 'fir', 'broadleaf', 'birch', 'bush', 'fern'])

/** A generated object's Three.js node: a mesh, or an instanced mesh for a scatter. */
export function generatedNode(object: SceneObject, document: SceneDocument | null): THREE.Mesh {
  if (object.kind === 'scatter') {
    const mesh = scatter(document, object)
    mesh.geometry.userData.leafAtlas = FOLIAGE.has(String(generatorParams('scatter', object.params).item))
    return mesh
  }
  return new THREE.Mesh(generatedGeometry(object), new THREE.MeshStandardMaterial())
}

/** Gives a generated object's material its vertex colours and, for foliage, the leaf atlas; water mirrors the scene. */
export function dressGenerated(node: THREE.Mesh, material: THREE.MeshStandardMaterial, hasOwnTexture: boolean) {
  material.vertexColors = node.geometry.hasAttribute('color')
  if (node.geometry.userData.water && !hasOwnTexture && material.opacity === 1) dressWater(node, material)
  if (node.geometry.userData.leafAtlas && !hasOwnTexture) {
    const atlas = leafAtlas()
    if (atlas) {
      material.map = atlas
      material.alphaTest = 0.5
      material.side = THREE.DoubleSide
      // sunlight through the leaves: crowns glow when the sun is behind them
      extendShader(material, 'leaf-glow', shader => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <lights_fragment_end>',
          `#include <lights_fragment_end>
          #if NUM_DIR_LIGHTS > 0
          {
            float behind = pow(saturate(dot(normalize(-vViewPosition), directionalLights[0].direction)), 3.0);
            reflectedLight.directDiffuse += diffuseColor.rgb * directionalLights[0].color * behind * 0.3;
          }
          #endif`,
        )
      })
    }
  }
  material.needsUpdate = true
}
